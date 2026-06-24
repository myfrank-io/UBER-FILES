<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Mon profil' })

const { data: me, refresh } = await useFetch('/api/dashboard/me')

const saving = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

const form = reactive({
  displayName: '',
  tagline: '',
  bio: '',
  photoUrl: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleClass: '',
  vehicleSeats: null as number | null,
  services: '',
  serviceArea: '',
  phone: '',
  contactEmail: '',
})

watchEffect(() => {
  if (!me.value) return
  const d = me.value as Record<string, unknown>
  form.displayName = (d.displayName as string) ?? ''
  form.tagline = (d.tagline as string) ?? ''
  form.bio = (d.bio as string) ?? ''
  form.photoUrl = (d.photoUrl as string) ?? ''
  form.vehicleMake = (d.vehicleMake as string) ?? ''
  form.vehicleModel = (d.vehicleModel as string) ?? ''
  form.vehicleClass = (d.vehicleClass as string) ?? ''
  form.vehicleSeats = (d.vehicleSeats as number | null) ?? null
  form.services = (d.services as string) ?? ''
  form.serviceArea = (d.serviceArea as string) ?? ''
  form.phone = (d.phone as string) ?? ''
  form.contactEmail = (d.contactEmail as string) ?? ''
})

async function save() {
  saving.value = true
  successMsg.value = ''
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/profile', {
      method: 'PATCH',
      body: {
        ...form,
        tagline: form.tagline || null,
        bio: form.bio || null,
        photoUrl: form.photoUrl || null,
        vehicleMake: form.vehicleMake || null,
        vehicleModel: form.vehicleModel || null,
        vehicleClass: form.vehicleClass || null,
        vehicleSeats: form.vehicleSeats || null,
        services: form.services || null,
        serviceArea: form.serviceArea || null,
        phone: form.phone || null,
        contactEmail: form.contactEmail || null,
      },
    })
    await refresh()
    successMsg.value = 'Profil mis à jour.'
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="text-2xl font-bold text-slate-900">Mon profil</h1>
    <p class="mt-1 text-sm text-slate-500">Ces informations apparaissent sur votre page publique.</p>

    <form class="mt-6 space-y-6" @submit.prevent="save">

      <!-- Présentation -->
      <div class="card space-y-4">
        <h2 class="font-semibold text-slate-900">Présentation</h2>
        <div>
          <label class="label" for="displayName">Nom affiché <span class="text-red-500">*</span></label>
          <input id="displayName" v-model="form.displayName" type="text" class="field" required maxlength="120" />
        </div>
        <div>
          <label class="label" for="tagline">Accroche (1 ligne)</label>
          <input id="tagline" v-model="form.tagline" type="text" class="field" maxlength="200" placeholder="Ex : Chauffeur VTC premium en Île-de-France" />
        </div>
        <div>
          <label class="label" for="bio">Biographie</label>
          <textarea id="bio" v-model="form.bio" class="field min-h-[100px]" maxlength="2000" placeholder="Décrivez votre expérience, vos valeurs…" />
        </div>
        <div>
          <label class="label" for="photoUrl">URL de votre photo</label>
          <input id="photoUrl" v-model="form.photoUrl" type="url" class="field" placeholder="https://…" />
          <img v-if="form.photoUrl" :src="form.photoUrl" alt="Aperçu" class="mt-2 h-20 w-20 rounded-full object-cover" />
        </div>
      </div>

      <!-- Véhicules -->
      <div class="card flex items-center justify-between gap-4">
        <div>
          <h2 class="font-semibold text-slate-900">Véhicules</h2>
          <p class="mt-1 text-sm text-slate-500">
            Gérez votre flotte (un ou plusieurs véhicules) avec photo du modèle.
          </p>
        </div>
        <NuxtLink to="/dashboard/vehicules" class="btn-ghost shrink-0">Gérer</NuxtLink>
      </div>

      <!-- Zone & prestations -->
      <div class="card space-y-4">
        <h2 class="font-semibold text-slate-900">Zone & prestations</h2>
        <div>
          <label class="label" for="services">Description des prestations</label>
          <textarea id="services" v-model="form.services" class="field min-h-[80px]" maxlength="1000" placeholder="Transferts aéroport, mise à disposition, mariage…" />
        </div>
        <div>
          <label class="label" for="serviceArea">Zone desservie</label>
          <input id="serviceArea" v-model="form.serviceArea" type="text" class="field" maxlength="500" placeholder="Île-de-France, aéroports CDG et Orly…" />
        </div>
      </div>

      <!-- Contact -->
      <div class="card space-y-4">
        <h2 class="font-semibold text-slate-900">Contact</h2>
        <div>
          <label class="label" for="phone">Téléphone</label>
          <input id="phone" v-model="form.phone" type="tel" class="field" maxlength="30" placeholder="+33 6 00 00 00 00" />
        </div>
        <div>
          <label class="label" for="contactEmail">Email de contact (notifications)</label>
          <input id="contactEmail" v-model="form.contactEmail" type="email" class="field" placeholder="vous@exemple.fr" />
        </div>
      </div>

      <p v-if="successMsg" class="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{{ successMsg }}</p>
      <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

      <div class="flex justify-end">
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  </div>
</template>
