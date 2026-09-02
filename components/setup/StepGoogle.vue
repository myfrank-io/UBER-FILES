<script setup lang="ts">
// Étape « Avis Google » : connecter sa fiche d'établissement pour que le lien
// « laisser un avis » parte automatiquement après chaque course. Repli : un
// lien d'avis collé à la main. Optionnelle.
import { setupApiError } from '~/lib/setup-view'

interface GooglePlace {
  placeId: string
  name: string | null
  address: string | null
}

const { state, result, next, refresh } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'google'))
const place = computed(() => state.value?.driver.googlePlace ?? null)
const manualUrl = computed(() => state.value?.driver.reviewUrl ?? null)

const query = ref('')
const results = ref<GooglePlace[] | null>(null)
const searching = ref(false)
const busy = ref(false)
const errorMsg = ref('')

async function search() {
  if (query.value.trim().length < 2) return
  searching.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ results: GooglePlace[] }>('/api/dashboard/google-place/search', {
      method: 'POST',
      body: { query: query.value },
    })
    results.value = res.results
  } catch (e) {
    errorMsg.value = setupApiError(e, 'Recherche impossible pour le moment.')
  } finally {
    searching.value = false
  }
}

async function connect(p: GooglePlace) {
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/google-place/connect', { method: 'POST', body: { placeId: p.placeId } })
    results.value = null
    query.value = ''
    await refresh()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}

async function disconnect() {
  busy.value = true
  try {
    if (place.value) await $fetch('/api/dashboard/google-place/disconnect', { method: 'POST' })
    else await $fetch('/api/dashboard/profile', { method: 'PATCH', body: { reviewUrl: null } })
    await refresh()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}

const manualOpen = ref(false)
const manualInput = ref('')
async function saveManual() {
  if (!manualInput.value.trim()) return
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/profile', { method: 'PATCH', body: { reviewUrl: manualInput.value.trim() } })
    manualOpen.value = false
    manualInput.value = ''
    await refresh()
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
    icon="⭐"
    title="Vos avis Google"
    subtitle="Après chaque course, vos clients reçoivent un lien pour vous laisser un avis. Les avis font venir les clients suivants."
    :done="step?.done"
  >
    <div v-if="place" class="rounded-2xl border border-green-200 bg-green-50 p-4">
      <p class="font-semibold text-green-900">✅ Fiche Google connectée</p>
      <p class="mt-1 text-sm text-green-800">{{ place.name }}<template v-if="place.address"> — {{ place.address }}</template></p>
      <button type="button" class="mt-2 text-xs font-medium text-green-800 underline" :disabled="busy" @click="disconnect">Changer de fiche</button>
    </div>
    <div v-else-if="manualUrl" class="rounded-2xl border border-green-200 bg-green-50 p-4">
      <p class="font-semibold text-green-900">✅ Lien d'avis enregistré</p>
      <p class="mt-1 break-all text-sm text-green-800">{{ manualUrl }}</p>
      <button type="button" class="mt-2 text-xs font-medium text-green-800 underline" :disabled="busy" @click="disconnect">Retirer</button>
    </div>

    <template v-else>
      <form class="flex gap-2" @submit.prevent="search">
        <input v-model="query" class="field" placeholder="Nom de votre entreprise ou lien Google Maps" data-testid="place-query" />
        <button type="submit" class="btn-primary shrink-0" :disabled="searching || query.trim().length < 2">{{ searching ? '…' : 'Chercher' }}</button>
      </form>

      <ul v-if="results" class="space-y-2">
        <li v-if="results.length === 0" class="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Aucune fiche trouvée. Essayez le nom exact de votre fiche Google, ou collez son lien de partage (Google Maps → Partager).
        </li>
        <li v-for="r in results" :key="r.placeId">
          <button type="button" class="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-300" :disabled="busy" @click="connect(r)">
            <span class="min-w-0">
              <span class="block truncate font-medium text-slate-900">{{ r.name }}</span>
              <span class="block truncate text-xs text-slate-500">{{ r.address }}</span>
            </span>
            <span class="shrink-0 text-sm font-semibold text-brand-700">Connecter</span>
          </button>
        </li>
      </ul>

      <details class="text-sm text-slate-600" :open="manualOpen">
        <summary class="cursor-pointer font-medium text-slate-800" @click.prevent="manualOpen = !manualOpen">J'ai un autre lien d'avis (Trustpilot, autre…)</summary>
        <form class="mt-2 flex gap-2" @submit.prevent="saveManual">
          <input v-model="manualInput" class="field" type="url" placeholder="https://…" />
          <button type="submit" class="btn-ghost shrink-0" :disabled="busy || !manualInput.trim()">Enregistrer</button>
        </form>
      </details>
    </template>

    <template #help>
      <p><strong>Pas encore de fiche Google ?</strong> Créez-la gratuitement sur <a href="https://www.google.com/business/" target="_blank" rel="noopener" class="font-medium text-brand-700 underline">google.com/business</a> (« Fiche d'établissement »). Choisissez la catégorie « Service de VTC », indiquez votre zone d'activité, validez par SMS ou courrier. Revenez ici quand elle est en ligne.</p>
      <p><strong>Fiche introuvable ?</strong> Ouvrez votre fiche dans l'app Google Maps → Partager → Copier le lien, et collez-le dans la recherche.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :error="errorMsg" :skippable="!step?.done" @next="goNext" @skip="goNext" />
    </template>
  </SetupStepShell>
</template>
