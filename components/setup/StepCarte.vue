<script setup lang="ts">
// Étape « Carte de visite » : la carte est déjà pré-remplie avec tout ce qui
// vient d'être saisi — on choisit un thème et on publie. Optionnelle.
import { QUICK_THEME_KEYS, cardTheme } from '~/lib/card-themes'
import type { CardEditorState, CardVehicle, CardView } from '~/lib/card-view'
import { setupApiError, type SetupVehicle } from '~/lib/setup-view'

const { result, next, refresh } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'carte'))

// La carte est créée (pré-remplie) au premier appel.
const { data: card, refresh: refreshCard } = await useFetch<CardEditorState>('/api/dashboard/card')
const { data: vehiclesData } = await useFetch<{ vehicles: SetupVehicle[] }>('/api/dashboard/vehicles')

const vehicles = computed<CardVehicle[]>(() =>
  (vehiclesData.value?.vehicles ?? []).map((v) => ({
    id: v.id,
    label: v.modelLabel,
    vehicleClass: v.vehicleClass,
    seats: v.seats,
    photoSrc: v.photoSrc,
  })),
)

const theme = ref('signature')
watchEffect(() => {
  if (card.value) theme.value = card.value.theme
})
const themes = computed(() => QUICK_THEME_KEYS.map((k) => cardTheme(k)))

const preview = computed<CardView | null>(() =>
  card.value
    ? {
        slug: card.value.slug,
        displayName: card.value.displayName,
        headline: card.value.headline,
        company: card.value.company,
        theme: theme.value,
        avatarUrl: card.value.avatarUrl ?? card.value.profilePhotoUrl ?? null,
        coverUrl: card.value.coverUrl,
        logoUrl: card.value.logoUrl,
        logoPlate: card.value.logoPlate,
        hasContactCard: card.value.hasContactCard,
        blocks: card.value.blocks.filter((b) => b.visible && (b.kind !== 'REVIEW_CTA' || card.value?.hasReviewLink)),
        vehicles: vehicles.value,
      }
    : null,
)

const busy = ref(false)
const errorMsg = ref('')

async function pickTheme(key: string) {
  theme.value = key
  try {
    await $fetch('/api/dashboard/card', { method: 'PATCH', body: { theme: key } })
  } catch (e) {
    errorMsg.value = setupApiError(e)
  }
}

async function publish() {
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/card', { method: 'PATCH', body: { theme: theme.value, published: true } })
    await Promise.all([refreshCard(), refresh()])
    await next()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}

async function goNext() {
  busy.value = true
  try {
    await next()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    icon="🪪"
    title="Votre carte de visite digitale"
    subtitle="Une page à partager d'un lien ou d'un QR code : vos coordonnées, vos liens, votre bouton de réservation. Elle est déjà prête."
    :done="step?.done"
  >
    <div v-if="card?.published" class="rounded-2xl border border-green-200 bg-green-50 p-4">
      <p class="font-semibold text-green-900">✅ Votre carte est en ligne</p>
      <a :href="`/carte/${card.slug}`" target="_blank" rel="noopener" class="mt-1 block break-all text-sm text-green-800 underline">/carte/{{ card.slug }} ↗</a>
    </div>

    <div>
      <p class="label">Ambiance</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in themes"
          :key="t.key"
          type="button"
          class="flex items-center gap-2 rounded-full border-2 py-1.5 pl-1.5 pr-3 text-sm"
          :class="theme === t.key ? 'border-brand-600' : 'border-slate-200 hover:border-brand-300'"
          @click="pickTheme(t.key)"
        >
          <span class="flex h-6 w-6 overflow-hidden rounded-full ring-1 ring-black/10" aria-hidden="true">
            <span class="h-full w-1/2" :style="{ background: t.tokens.bg }" />
            <span class="h-full w-1/2" :style="{ background: t.tokens.accent }" />
          </span>
          {{ t.label }}
        </button>
      </div>
      <p class="mt-1.5 text-xs text-slate-500">Plus de thèmes, photo de couverture, logo et blocs personnalisés dans votre espace → <em>Carte</em>.</p>
    </div>

    <div v-if="preview" class="mx-auto w-full max-w-[380px] overflow-hidden rounded-[28px] border-[6px] border-slate-900 shadow-xl">
      <div class="max-h-[520px] overflow-y-auto">
        <CardRender :card="preview" preview />
      </div>
    </div>

    <template #help>
      <p>La carte reprend automatiquement votre nom, votre photo, votre téléphone, WhatsApp, votre véhicule et le bouton « Réserver ». Vous pourrez y ajouter vos réseaux sociaux, un logo, une couverture.</p>
    </template>

    <template #actions>
      <SetupActions
        :busy="busy"
        :error="errorMsg"
        :skippable="!card?.published"
        :next-label="card?.published ? 'Continuer' : 'Publier ma carte'"
        @next="card?.published ? goNext() : publish()"
        @skip="goNext"
      />
    </template>
  </SetupStepShell>
</template>
