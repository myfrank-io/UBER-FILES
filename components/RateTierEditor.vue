<script setup lang="ts">
// Éditeur d'une grille dégressive au km : des lignes « De X à Y km → prix »
// chaînées automatiquement (la borne basse d'une ligne = la borne haute de la
// précédente, impossible de créer un trou ou un chevauchement), la dernière
// ligne étant toujours « Au-delà ». Les lignes sont mutées en place dans le
// formulaire parent ; la grille n'est envoyée à l'API que par le parent.
import { roundCents } from '~/lib/money'
import { tierSegments } from '~/lib/pricing'
import { parseTierRows, type TierRowForm } from '~/lib/tier-form'

const props = defineProps<{ tiers: TierRowForm[]; currency: string }>()
const { formatMoney } = useFormat()

// Borne basse affichée d'une ligne (= borne haute saisie sur la précédente).
function fromKm(i: number): string {
  if (i === 0) return '0'
  const prev = Math.round(parseFloat(String(props.tiers[i - 1]?.uptoKm)))
  return Number.isFinite(prev) && prev > 0 ? String(prev) : '…'
}

function addRow() {
  // Insérée avant la ligne « Au-delà », qui reste toujours la dernière.
  props.tiers.splice(props.tiers.length - 1, 0, { uptoKm: '', priceEuros: '' })
}

function removeRow(i: number) {
  props.tiers.splice(i, 1)
}

const parsed = computed(() => parseTierRows(props.tiers))

// Exemple chiffré en direct, détaillé tranche par tranche (même esprit que
// l'exemple de la mise à disposition) : la sémantique du barème — chaque km au
// tarif de sa tranche — se comprend sans une ligne d'explication. Distance
// d'exemple : la dizaine ronde qui suit le premier seuil, pour entamer au
// moins deux tranches.
const example = computed(() => {
  if (!parsed.value) return ''
  const sampleKm = (Math.floor(parsed.value[0].uptoKm! / 10) + 1) * 10
  const segments = tierSegments(sampleKm, parsed.value)
  const total = segments.reduce((sum, s) => sum + roundCents(s.km * s.pricePerKmCents), 0)
  const detail = segments
    .map((s) => `${s.km} km × ${formatMoney(s.pricePerKmCents, props.currency)}`)
    .join(' + ')
  return `Exemple : une course de ${sampleKm} km = ${detail} = ${formatMoney(total, props.currency)}.`
})
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(row, i) in tiers"
      :key="i"
      class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-slate-700"
    >
      <template v-if="i < tiers.length - 1">
        <span class="whitespace-nowrap">De {{ fromKm(i) }} à</span>
        <input
          v-model="row.uptoKm"
          type="number"
          min="1"
          step="1"
          class="field !w-20 !py-2"
          :placeholder="i === 0 ? '21' : ''"
        />
        <span>km :</span>
      </template>
      <span v-else class="whitespace-nowrap">Au-delà de {{ fromKm(i) }} km :</span>
      <input
        v-model="row.priceEuros"
        type="number"
        step="0.01"
        min="0.01"
        class="field !w-24 !py-2"
        :placeholder="i === 0 ? '2,00' : '1,70'"
      />
      <span>€/km</span>
      <button
        v-if="i < tiers.length - 1 && tiers.length > 2"
        type="button"
        class="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
        aria-label="Supprimer ce palier"
        @click="removeRow(i)"
      >
        ✕
      </button>
    </div>

    <button
      v-if="tiers.length < 5"
      type="button"
      class="text-xs font-semibold text-brand-700 hover:underline"
      @click="addRow"
    >
      + Ajouter un palier
    </button>

    <p v-if="example" class="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
      {{ example }}
    </p>
    <p v-else class="text-xs text-amber-700">
      Complétez la grille : un prix par palier, des seuils strictement croissants.
    </p>
  </div>
</template>
