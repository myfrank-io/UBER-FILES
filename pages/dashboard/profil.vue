<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Mon profil' })

const { data: me, refresh } = await useFetch('/api/dashboard/me')

const saving = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

// Import de la photo de profil depuis un fichier (galerie / pellicule du téléphone
// sur mobile, ou disque sur ordinateur). On redimensionne l'image côté client pour
// rester léger, puis on la stocke en data URL dans `form.photoUrl`.
const photoInput = ref<HTMLInputElement | null>(null)
const photoLoading = ref(false)
const photoError = ref('')
const photoSuccess = ref('')

const MAX_PHOTO_SOURCE_BYTES = 15 * 1024 * 1024 // 15 Mo en entrée (photos de smartphone)
const MAX_PHOTO_DIMENSION = 512 // px, côté le plus long après redimensionnement

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Ce fichier n'est pas une image valide."))
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height))
        const width = Math.round(img.width * scale)
        const height = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Traitement de l’image impossible.'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Enregistre immédiatement la photo en base (sans attendre le bouton « Enregistrer »
// en bas de page) : plus simple et plus fiable côté mobile. On envoie uniquement le
// champ photoUrl — l'endpoint accepte les mises à jour partielles.
async function persistPhoto(value: string | null) {
  photoError.value = ''
  photoSuccess.value = ''
  photoLoading.value = true
  try {
    await $fetch('/api/dashboard/profile', { method: 'PATCH', body: { photoUrl: value } })
    form.photoUrl = value ?? ''
    await refresh()
    photoSuccess.value = value ? 'Photo enregistrée.' : 'Photo supprimée.'
  } catch (e) {
    photoError.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage ||
      "Enregistrement de la photo impossible. Vérifiez votre connexion et réessayez."
  } finally {
    photoLoading.value = false
  }
}

async function onPhotoSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  photoError.value = ''
  photoSuccess.value = ''

  if (!file.type.startsWith('image/')) {
    photoError.value = 'Veuillez choisir une image (JPG, PNG, WEBP…).'
    input.value = ''
    return
  }
  if (file.size > MAX_PHOTO_SOURCE_BYTES) {
    photoError.value = 'Image trop volumineuse (15 Mo maximum).'
    input.value = ''
    return
  }

  photoLoading.value = true
  try {
    const dataUrl = await resizeImage(file)
    await persistPhoto(dataUrl)
  } catch (err) {
    photoError.value = (err as Error).message || 'Import de la photo impossible.'
    photoLoading.value = false
  } finally {
    input.value = '' // permet de re-sélectionner le même fichier
  }
}

function removePhoto() {
  void persistPhoto(null)
}

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
    // La photo est enregistrée à part (dès l'import, via persistPhoto) : on ne
    // renvoie jamais form.photoUrl ici — c'est l'URL de l'endpoint image, pas
    // une valeur à stocker.
    await $fetch('/api/dashboard/profile', {
      method: 'PATCH',
      body: {
        displayName: form.displayName,
        tagline: form.tagline || null,
        bio: form.bio || null,
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
          <label class="label">Photo de profil</label>
          <div class="mt-1 flex items-center gap-4">
            <img
              v-if="form.photoUrl"
              :src="form.photoUrl"
              alt="Aperçu de votre photo"
              class="h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
            />
            <div
              v-else
              class="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"
              aria-hidden="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8">
                <path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clip-rule="evenodd" />
              </svg>
            </div>

            <!-- `accept="image/*"` ouvre directement l'appareil photo / la pellicule sur mobile -->
            <input
              ref="photoInput"
              type="file"
              accept="image/*"
              class="sr-only"
              @change="onPhotoSelected"
            />
            <div class="space-y-1.5">
              <button
                type="button"
                class="btn-ghost px-4 py-2 text-sm"
                :disabled="photoLoading"
                @click="photoInput?.click()"
              >
                {{ photoLoading ? 'Chargement…' : form.photoUrl ? 'Changer la photo' : 'Importer une photo' }}
              </button>
              <button
                v-if="form.photoUrl && !photoLoading"
                type="button"
                class="block text-sm font-medium text-red-600 hover:underline"
                @click="removePhoto"
              >
                Supprimer
              </button>
              <p class="text-xs text-slate-400">
                JPG, PNG ou WEBP — depuis votre téléphone ou ordinateur. Enregistrement automatique.
              </p>
            </div>
          </div>
          <p v-if="photoError" class="mt-2 text-sm text-red-600">{{ photoError }}</p>
          <p v-else-if="photoSuccess" class="mt-2 text-sm text-green-600">{{ photoSuccess }}</p>
        </div>
      </div>

      <!-- Véhicule -->
      <div class="card space-y-4">
        <h2 class="font-semibold text-slate-900">Véhicule</h2>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="vehicleMake">Marque</label>
            <input id="vehicleMake" v-model="form.vehicleMake" type="text" class="field" maxlength="60" placeholder="Mercedes" />
          </div>
          <div>
            <label class="label" for="vehicleModel">Modèle</label>
            <input id="vehicleModel" v-model="form.vehicleModel" type="text" class="field" maxlength="60" placeholder="Classe E" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="vehicleClass">Catégorie</label>
            <input id="vehicleClass" v-model="form.vehicleClass" type="text" class="field" maxlength="60" placeholder="Berline, Van, Premium…" />
          </div>
          <div>
            <label class="label" for="vehicleSeats">Nombre de places</label>
            <input id="vehicleSeats" v-model.number="form.vehicleSeats" type="number" class="field" min="1" max="20" />
          </div>
        </div>
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
