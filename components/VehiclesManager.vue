<script setup lang="ts">
// Gestion compacte de la flotte du chauffeur, intégrée dans la page Profil.
import { searchCatalog, type VehicleCatalogEntry } from '~/lib/vehicle-catalog'

interface Vehicle {
  id: string
  make: string
  modelFamily: string
  modelLabel: string
  vehicleClass: string | null
  seats: number | null
  color: string | null
  isPrimary: boolean
}

const { data, refresh } = await useFetch<{ vehicles: Vehicle[] }>('/api/dashboard/vehicles')
const vehicles = computed(() => data.value?.vehicles ?? [])

const showModal = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const errorMsg = ref('')

const form = reactive({
  make: '',
  modelFamily: '',
  modelLabel: '',
  vehicleClass: '' as string,
  seats: null as number | null,
  color: '',
  isPrimary: false,
})

const modelQuery = ref('')
const showResults = ref(false)
const results = computed(() => searchCatalog(modelQuery.value))
const hasModel = computed(() => Boolean(form.make && form.modelFamily && form.modelLabel))

function resetForm() {
  form.make = ''
  form.modelFamily = ''
  form.modelLabel = ''
  form.vehicleClass = ''
  form.seats = null
  form.color = ''
  form.isPrimary = false
  modelQuery.value = ''
  showResults.value = false
  errorMsg.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  showModal.value = true
}

function openEdit(v: Vehicle) {
  editingId.value = v.id
  form.make = v.make
  form.modelFamily = v.modelFamily
  form.modelLabel = v.modelLabel
  form.vehicleClass = v.vehicleClass ?? ''
  form.seats = v.seats
  form.color = v.color ?? ''
  form.isPrimary = v.isPrimary
  modelQuery.value = v.modelLabel
  showResults.value = false
  errorMsg.value = ''
  showModal.value = true
}

function pickModel(entry: VehicleCatalogEntry) {
  form.make = entry.make
  form.modelFamily = entry.modelFamily
  form.modelLabel = entry.label
  if (!form.vehicleClass) form.vehicleClass = entry.vehicleClass
  if (form.seats == null) form.seats = entry.seats
  modelQuery.value = entry.label
  showResults.value = false
}

async function save() {
  if (!hasModel.value) {
    errorMsg.value = 'Recherchez et sélectionnez un modèle dans la liste.'
    return
  }
  saving.value = true
  errorMsg.value = ''
  try {
    const payload = {
      make: form.make,
      modelFamily: form.modelFamily,
      modelLabel: form.modelLabel,
      vehicleClass: form.vehicleClass || null,
      seats: form.seats || null,
      color: form.color || null,
      isPrimary: form.isPrimary,
    }
    if (editingId.value) {
      await $fetch(`/api/dashboard/vehicles/${editingId.value}`, { method: 'PATCH', body: payload })
    } else {
      await $fetch('/api/dashboard/vehicles', { method: 'POST', body: payload })
    }
    await refresh()
    showModal.value = false
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    saving.value = false
  }
}

async function setPrimary(v: Vehicle) {
  if (v.isPrimary) return
  await $fetch(`/api/dashboard/vehicles/${v.id}`, { method: 'PATCH', body: { isPrimary: true } })
  await refresh()
}

async function remove(v: Vehicle) {
  if (!confirm(`Supprimer ${v.modelLabel} ?`)) return
  await $fetch(`/api/dashboard/vehicles/${v.id}`, { method: 'DELETE' })
  await refresh()
}
</script>

<template>
  <div class="card space-y-4">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="font-semibold text-slate-900">Véhicules</h2>
        <p class="mt-1 text-sm text-slate-500">Un ou plusieurs véhicules, affichés avec la photo du modèle.</p>
      </div>
      <button type="button" class="btn-ghost shrink-0 text-sm" @click="openCreate">+ Ajouter</button>
    </div>

    <p v-if="vehicles.length === 0" class="text-sm text-slate-400">Aucun véhicule pour le moment.</p>

    <!-- Liste compacte -->
    <ul v-else class="divide-y divide-slate-100">
      <li v-for="v in vehicles" :key="v.id" class="flex items-center gap-3 py-2.5">
        <div class="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-50">
          <VehicleImage
            :make="v.make"
            :model-family="v.modelFamily"
            :vehicle-class="v.vehicleClass"
            :color="v.color"
            :alt="v.modelLabel"
            class="h-full w-full p-1"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
            {{ v.modelLabel }}
            <span v-if="v.isPrimary" class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              En avant
            </span>
          </p>
          <p class="truncate text-xs text-slate-500">
            <span v-if="v.vehicleClass">{{ v.vehicleClass }}</span>
            <span v-if="v.seats"> · {{ v.seats }} pl.</span>
            <span v-if="v.color"> · {{ v.color }}</span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2 text-xs">
          <button v-if="!v.isPrimary" type="button" class="text-brand-700 hover:underline" @click="setPrimary(v)">
            En avant
          </button>
          <button type="button" class="text-slate-500 hover:underline" @click="openEdit(v)">Modifier</button>
          <button type="button" class="text-red-600 hover:underline" @click="remove(v)">Suppr.</button>
        </div>
      </li>
    </ul>

    <!-- Modale ajout / édition -->
    <AppModal v-if="showModal" @close="showModal = false">
      <h2 class="text-lg font-bold text-slate-900">
        {{ editingId ? 'Modifier le véhicule' : 'Ajouter un véhicule' }}
      </h2>

      <div class="mt-5 space-y-4">
        <div class="relative">
          <label class="label" for="modelSearch">Modèle</label>
          <input
            id="modelSearch"
            v-model="modelQuery"
            type="text"
            class="field"
            placeholder="Rechercher : Mercedes Classe V, Tesla Model 3…"
            autocomplete="off"
            @focus="showResults = true"
            @input="showResults = true"
          />
          <ul
            v-if="showResults && results.length > 0"
            class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            <li
              v-for="entry in results"
              :key="entry.make + entry.modelFamily"
              class="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm hover:bg-brand-50"
              @mousedown.prevent="pickModel(entry)"
            >
              <span>{{ entry.label }}</span>
              <span class="text-xs text-slate-400">{{ entry.vehicleClass }}</span>
            </li>
          </ul>
        </div>

        <div v-if="hasModel" class="flex h-32 items-center justify-center rounded-xl bg-slate-50">
          <VehicleImage
            :make="form.make"
            :model-family="form.modelFamily"
            :vehicle-class="form.vehicleClass"
            :color="form.color"
            :alt="form.modelLabel"
            class="h-full w-full p-2"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="vClass">Catégorie</label>
            <input id="vClass" v-model="form.vehicleClass" type="text" class="field" maxlength="60" placeholder="Berline, Van…" />
          </div>
          <div>
            <label class="label" for="vSeats">Places</label>
            <input id="vSeats" v-model.number="form.seats" type="number" class="field" min="1" max="20" />
          </div>
        </div>
        <div>
          <label class="label" for="vColor">Couleur (optionnel)</label>
          <input id="vColor" v-model="form.color" type="text" class="field" maxlength="40" placeholder="Noir, Gris…" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input v-model="form.isPrimary" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
          Mettre ce véhicule en avant
        </label>

        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="btn-ghost" @click="showModal = false">Annuler</button>
        <button type="button" class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
