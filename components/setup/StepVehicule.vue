<script setup lang="ts">
// Étape « Véhicule » : au moins un véhicule. Recherche dans le catalogue (avec
// saisie libre), couleur, places, photo optionnelle. Mêmes routes que la page
// Profil (/api/dashboard/vehicles).
import { customCatalogEntry, searchCatalog, type VehicleCatalogEntry } from '~/lib/vehicle-catalog'
import { setupApiError, type SetupVehicle } from '~/lib/setup-view'

const { result, next, refresh } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'vehicule'))

const { data, refresh: refreshVehicles } = await useFetch<{ vehicles: SetupVehicle[] }>('/api/dashboard/vehicles')
const vehicles = computed(() => data.value?.vehicles ?? [])

// Formulaire d'ajout : ouvert d'office tant qu'il n'y a aucun véhicule.
const adding = ref(false)
watchEffect(() => {
  if (data.value && vehicles.value.length === 0) adding.value = true
})

const form = reactive({
  make: '',
  modelFamily: '',
  modelLabel: '',
  vehicleClass: '',
  seats: null as number | null,
  color: '',
})
const modelQuery = ref('')
const showResults = ref(false)
const results = computed(() => searchCatalog(modelQuery.value, 6))
const exactMatch = computed(() => {
  const q = modelQuery.value.trim().toLowerCase()
  return Boolean(q) && results.value.some((r) => r.label.toLowerCase() === q)
})

const COLORS = ['Noir', 'Gris', 'Blanc', 'Bleu', 'Argent', 'Autre']

function pickModel(entry: VehicleCatalogEntry) {
  form.make = entry.make
  form.modelFamily = entry.modelFamily
  form.modelLabel = entry.label
  form.vehicleClass = entry.vehicleClass
  form.seats = entry.seats
  modelQuery.value = entry.label
  showResults.value = false
}

function useCustomModel() {
  const custom = customCatalogEntry(modelQuery.value)
  if (!custom.modelLabel) return
  form.make = custom.make
  form.modelFamily = custom.modelFamily
  form.modelLabel = custom.modelLabel
  modelQuery.value = custom.modelLabel
  showResults.value = false
}

// Photo optionnelle (compressée côté client, comme dans l'espace).
const photoInput = ref<HTMLInputElement | null>(null)
const photo = ref<string | null>(null)
const photoBusy = ref(false)
async function onPhotoSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  errorMsg.value = ''
  if (!file.type.startsWith('image/') || file.size > MAX_PHOTO_SOURCE_BYTES) {
    errorMsg.value = 'Choisissez une image de 15 Mo maximum.'
    input.value = ''
    return
  }
  photoBusy.value = true
  try {
    photo.value = await resizeImageToDataUrl(file, 1280)
  } catch (err) {
    errorMsg.value = (err as Error).message || 'Import de la photo impossible.'
  } finally {
    photoBusy.value = false
    input.value = ''
  }
}

const busy = ref(false)
const errorMsg = ref('')

function resetForm() {
  Object.assign(form, { make: '', modelFamily: '', modelLabel: '', vehicleClass: '', seats: null, color: '' })
  modelQuery.value = ''
  photo.value = null
  showResults.value = false
}

async function addVehicle() {
  const typed = modelQuery.value.trim()
  if (!typed) {
    errorMsg.value = 'Indiquez le modèle de votre véhicule.'
    return
  }
  if (!form.modelLabel || typed !== form.modelLabel) useCustomModel()
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/vehicles', {
      method: 'POST',
      body: {
        make: form.make,
        modelFamily: form.modelFamily,
        modelLabel: form.modelLabel,
        vehicleClass: form.vehicleClass || null,
        seats: form.seats || null,
        color: form.color || null,
        photoUrl: photo.value,
      },
    })
    resetForm()
    adding.value = false
    await Promise.all([refreshVehicles(), refresh()])
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}

async function removeVehicle(v: SetupVehicle) {
  if (!confirm(`Retirer ${v.modelLabel} ?`)) return
  try {
    await $fetch(`/api/dashboard/vehicles/${v.id}`, { method: 'DELETE' })
    await Promise.all([refreshVehicles(), refresh()])
  } catch (e) {
    errorMsg.value = setupApiError(e)
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
    icon="🚗"
    title="Votre véhicule"
    subtitle="Vos clients voient le modèle, la couleur et le nombre de places avant de réserver."
    :done="step?.done"
  >
    <!-- Véhicules enregistrés -->
    <ul v-if="vehicles.length" class="space-y-2">
      <li v-for="v in vehicles" :key="v.id" class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
        <div class="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-50">
          <VehicleImage :make="v.make" :model-family="v.modelFamily" :color="v.color" :vehicle-class="v.vehicleClass" :photo-url="v.photoSrc" :alt="v.modelLabel" class="h-full w-full" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-slate-900">{{ v.modelLabel }}</p>
          <p class="text-xs text-slate-500">
            {{ [v.vehicleClass, v.color, v.seats ? `${v.seats} places` : null].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <button type="button" class="rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600" :title="`Retirer ${v.modelLabel}`" @click="removeVehicle(v)">Retirer</button>
      </li>
    </ul>

    <button v-if="!adding && vehicles.length" type="button" class="btn-ghost w-full" @click="adding = true">+ Ajouter un autre véhicule</button>

    <!-- Formulaire d'ajout -->
    <div v-if="adding" class="space-y-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
      <div class="relative">
        <label class="label" for="setup-model">Marque et modèle</label>
        <input
          id="setup-model"
          v-model="modelQuery"
          class="field"
          placeholder="Ex : Mercedes Classe E"
          autocomplete="off"
          data-testid="vehicle-model"
          @focus="showResults = true"
          @input="showResults = true"
        />
        <ul
          v-if="showResults && modelQuery.trim()"
          class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <li v-for="r in results" :key="r.make + r.modelFamily">
            <button type="button" class="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-slate-50" @mousedown.prevent="pickModel(r)">
              <span>{{ r.label }}</span>
              <span class="text-xs text-slate-400">{{ r.vehicleClass }} · {{ r.seats }} pl.</span>
            </button>
          </li>
          <li v-if="!exactMatch">
            <button type="button" class="w-full px-3.5 py-2.5 text-left text-sm text-brand-700 hover:bg-brand-50" @mousedown.prevent="useCustomModel">
              Utiliser « {{ modelQuery.trim() }} »
            </button>
          </li>
        </ul>
      </div>

      <div>
        <p class="label">Couleur</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            class="rounded-full border px-3 py-1.5 text-sm"
            :class="form.color === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'"
            @click="form.color = c"
          >{{ c }}</button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="setup-seats">Places passagers</label>
          <input id="setup-seats" v-model.number="form.seats" type="number" min="1" max="20" class="field" placeholder="4" inputmode="numeric" />
        </div>
        <div>
          <label class="label" for="setup-class">Catégorie</label>
          <select id="setup-class" v-model="form.vehicleClass" class="field">
            <option value="">—</option>
            <option>Berline</option>
            <option>Premium</option>
            <option>Van</option>
            <option>SUV</option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <img v-if="photo" :src="photo" alt="" class="h-14 w-20 rounded-lg object-cover" />
        <input ref="photoInput" type="file" accept="image/*" class="sr-only" @change="onPhotoSelected" />
        <button type="button" class="btn-ghost !min-h-[40px] px-4 py-2 text-sm" :disabled="photoBusy" @click="photoInput?.click()">
          {{ photoBusy ? '…' : photo ? 'Changer la photo' : '📷 Photo du véhicule (optionnel)' }}
        </button>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button v-if="vehicles.length" type="button" class="btn-ghost" @click="adding = false; resetForm()">Annuler</button>
        <button type="button" class="btn-primary" :disabled="busy || !modelQuery.trim()" data-testid="vehicle-add" @click="addVehicle">
          {{ busy ? 'Enregistrement…' : 'Ajouter ce véhicule' }}
        </button>
      </div>
    </div>

    <template #help>
      <p>Tapez la marque ou le modèle : la liste propose les véhicules les plus courants. Si le vôtre n'y est pas, tapez-le simplement et choisissez « Utiliser … ».</p>
      <p>Sans photo, une image du modèle est affichée automatiquement.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :disabled="vehicles.length === 0" :error="errorMsg" @next="goNext" />
    </template>
  </SetupStepShell>
</template>
