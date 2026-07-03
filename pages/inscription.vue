<script setup lang="ts">
// Inscription self-service d'un chauffeur depuis la landing.
// Le chauffeur saisit toutes ses informations ; son profil est créé en statut
// PENDING (soumis à validation) puis il est connecté et arrive dans son espace.
definePageMeta({ layout: 'default' })
useHead({ title: 'Devenir chauffeur — Inscription' })

const { fetch: refreshSession } = useUserSession()

const form = reactive({
  email: '',
  password: '',
  displayName: '',
  slug: '',
  tagline: '',
  phone: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleClass: '',
  vehicleSeats: null as number | null,
  serviceArea: '',
  services: '',
})

const errorMsg = ref('')
const loading = ref(false)
const slugTouched = ref(false)

// Génère un slug d'URL propre à partir d'un texte libre.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques (accents)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Pré-remplit le slug depuis le nom affiché tant que l'utilisateur ne l'a pas édité.
watch(
  () => form.displayName,
  (name) => {
    if (!slugTouched.value) form.slug = slugify(name)
  },
)

function onSlugInput() {
  slugTouched.value = true
  // Sanitize léger pendant la frappe : on n'élague pas les tirets en cours de saisie.
  form.slug = form.slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
}

const appBase = useRuntimeConfig().public.appBaseUrl

async function register() {
  loading.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        slug: form.slug,
        tagline: form.tagline || undefined,
        phone: form.phone || undefined,
        vehicleMake: form.vehicleMake || undefined,
        vehicleModel: form.vehicleModel || undefined,
        vehicleClass: form.vehicleClass || undefined,
        vehicleSeats: form.vehicleSeats || undefined,
        serviceArea: form.serviceArea || undefined,
        services: form.services || undefined,
      },
    })
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Inscription impossible.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50 py-10">
    <div class="mx-auto max-w-2xl px-5">
      <NuxtLink to="/" class="text-sm text-slate-400 hover:text-slate-700">← Accueil</NuxtLink>

      <div class="mt-4">
        <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">Devenez chauffeur partenaire</h1>
        <p class="mt-2 text-slate-600">
          Créez votre page de réservation à votre nom. Renseignez vos informations :
          votre profil sera vérifié par notre équipe, puis mis en ligne après validation.
        </p>
      </div>

      <form class="mt-8 space-y-6" @submit.prevent="register">
        <!-- Compte de connexion -->
        <div class="card space-y-4">
          <h2 class="font-semibold text-slate-900">Compte de connexion</h2>
          <div>
            <label class="label" for="email">Email <span class="text-red-500">*</span></label>
            <input id="email" v-model="form.email" type="email" class="field" required autocomplete="email" />
          </div>
          <div>
            <label class="label" for="password">Mot de passe <span class="text-red-500">*</span></label>
            <input id="password" v-model="form.password" type="password" class="field" required minlength="8" autocomplete="new-password" placeholder="8 caractères minimum" />
          </div>
        </div>

        <!-- Présentation -->
        <div class="card space-y-4">
          <h2 class="font-semibold text-slate-900">Votre présentation</h2>
          <div>
            <label class="label" for="displayName">Nom affiché <span class="text-red-500">*</span></label>
            <input id="displayName" v-model="form.displayName" type="text" class="field" required maxlength="120" placeholder="Karim — VTC Paris" />
          </div>
          <div>
            <label class="label" for="slug">Adresse de votre page <span class="text-red-500">*</span></label>
            <div class="flex items-center gap-1">
              <span class="whitespace-nowrap text-sm text-slate-400">{{ appBase }}/</span>
              <input id="slug" v-model="form.slug" type="text" class="field" required maxlength="60" placeholder="karim-paris" @input="onSlugInput" />
            </div>
            <p class="mt-1 text-xs text-slate-400">Minuscules, chiffres et tirets uniquement.</p>
          </div>
          <div>
            <label class="label" for="tagline">Accroche (1 ligne)</label>
            <input id="tagline" v-model="form.tagline" type="text" class="field" maxlength="200" placeholder="Chauffeur VTC premium en Île-de-France" />
          </div>
          <div>
            <label class="label" for="phone">Téléphone</label>
            <input id="phone" v-model="form.phone" type="tel" class="field" maxlength="30" placeholder="+33 6 00 00 00 00" />
          </div>
        </div>

        <!-- Véhicule -->
        <div class="card space-y-4">
          <h2 class="font-semibold text-slate-900">Votre véhicule</h2>
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
            <label class="label" for="serviceArea">Zone desservie</label>
            <input id="serviceArea" v-model="form.serviceArea" type="text" class="field" maxlength="500" placeholder="Île-de-France, aéroports CDG et Orly…" />
          </div>
          <div>
            <label class="label" for="services">Description des prestations</label>
            <textarea id="services" v-model="form.services" class="field min-h-[80px]" maxlength="1000" placeholder="Transferts aéroport, mise à disposition, mariage…" />
          </div>
        </div>

        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Création du compte…' : 'Créer mon profil chauffeur' }}
        </button>

        <p class="text-center text-sm text-slate-500">
          Vous avez déjà un compte ?
          <NuxtLink to="/dashboard/login" class="font-semibold text-brand-700 hover:underline">Se connecter</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
