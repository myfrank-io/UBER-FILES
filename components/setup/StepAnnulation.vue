<script setup lang="ts">
// Étape « Annulation » : délai gratuit et pourcentage retenu, avec un exemple
// concret. Confirmée explicitement (elle a des valeurs par défaut).
import { setupApiError } from '~/lib/setup-view'

const { state, result, next } = useSetupFlow()
const { formatMoney } = useFormat()
const step = computed(() => result.value?.steps.find((s) => s.key === 'annulation'))

const form = reactive({ freeUntilHours: 24, retainedPercent: 50 })
let seeded = false
watch(
  () => state.value?.driver.cancellationPolicy,
  (p) => {
    if (!p || seeded) return
    seeded = true
    form.freeUntilHours = p.freeUntilHours
    form.retainedPercent = p.retainedPercent
  },
  { immediate: true },
)

const HOURS = [6, 12, 24, 48, 72]
const PERCENTS = [0, 30, 50, 100]

const hoursLabel = (h: number) => (h >= 24 && h % 24 === 0 ? `${h / 24} jour${h > 24 ? 's' : ''}` : `${h} h`)

// Exemple sur une course de 80 €.
const example = computed(() => {
  const ride = 8000
  const kept = Math.round((ride * form.retainedPercent) / 100)
  if (form.retainedPercent === 0) {
    return `Un client peut annuler à tout moment sans frais.`
  }
  return `Un client qui annule moins de ${hoursLabel(form.freeUntilHours)} avant une course de ${formatMoney(ride)} vous doit ${formatMoney(kept)}.`
})

const busy = ref(false)
const errorMsg = ref('')

async function save() {
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/cancellation-policy', { method: 'PATCH', body: { ...form } })
    await $fetch('/api/setup/confirm', { method: 'POST', body: { step: 'annulation' } })
    await next()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    icon="🗓️"
    title="Vos conditions d'annulation"
    subtitle="Affichées au client avant qu'il réserve. Simple et clair vaut mieux que compliqué."
    :done="step?.done"
  >
    <div>
      <p class="label">Annulation gratuite jusqu'à</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="h in HOURS"
          :key="h"
          type="button"
          class="rounded-full border px-3.5 py-2 text-sm font-medium"
          :class="form.freeUntilHours === h ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'"
          @click="form.freeUntilHours = h"
        >{{ hoursLabel(h) }} avant</button>
      </div>
    </div>

    <div>
      <p class="label">Au-delà, montant retenu</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="p in PERCENTS"
          :key="p"
          type="button"
          class="rounded-full border px-3.5 py-2 text-sm font-medium"
          :class="form.retainedPercent === p ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'"
          @click="form.retainedPercent = p"
        >{{ p === 0 ? 'Rien' : p === 100 ? 'La totalité' : `${p} %` }}</button>
      </div>
    </div>

    <p class="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <strong>Concrètement :</strong> {{ example }}
    </p>

    <template #help>
      <p>Le montant retenu ne s'applique que si le client a payé en ligne. Pour un règlement sur place, la règle est indicative.</p>
      <p>La plupart des chauffeurs choisissent <strong>24 h</strong> et <strong>50 %</strong>.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :error="errorMsg" next-label="C'est bon, continuer" @next="save" />
    </template>
  </SetupStepShell>
</template>
