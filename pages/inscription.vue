<script setup lang="ts">
// Inscription chauffeur — parcours en 2 étapes, charte Ridewiz « Signature ».
// Étape 1 : l'essentiel (nom, email, mot de passe) avec aperçu en direct de
// l'adresse de la page. Étape 2 : profil (optionnel, complétable plus tard).
// Les styles sont scopés à la page, comme sur la landing.
definePageMeta({ layout: 'default' })
useHead({
  title: 'Devenir chauffeur — Ridewiz',
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@500;600&display=swap',
    },
  ],
})

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

const step = ref<1 | 2>(1)
const errorMsg = ref('')
const loading = ref(false)
const slugTouched = ref(false)
const editingSlug = ref(false)
const showPassword = ref(false)

// Génère un slug d'URL propre à partir d'un texte libre.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques (accents)
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
}

const appHost = useRuntimeConfig()
  .public.appBaseUrl.replace(/^https?:\/\//, '')
  .replace(/\/$/, '')

// Validation de l'étape 1 (l'essentiel) — messages inline, pas de surprise au submit.
const fieldErrors = reactive<Record<string, string>>({})
function validateStep1(): boolean {
  fieldErrors.displayName = form.displayName.trim().length >= 2 ? '' : 'Indiquez votre nom (2 caractères minimum).'
  fieldErrors.email = /.+@.+\..+/.test(form.email) ? '' : 'Indiquez un email valide.'
  fieldErrors.password = form.password.length >= 8 ? '' : '8 caractères minimum.'
  fieldErrors.slug = form.slug.length >= 2 ? '' : 'Votre adresse de page est trop courte.'
  return !fieldErrors.displayName && !fieldErrors.email && !fieldErrors.password && !fieldErrors.slug
}

function goToStep2() {
  errorMsg.value = ''
  if (!validateStep1()) return
  step.value = 2
  window.scrollTo({ top: 0 })
}

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
    // Adresse déjà prise ou email existant : on ramène sur l'étape 1 pour corriger.
    if (/adresse|email|compte/i.test(errorMsg.value)) {
      step.value = 1
      editingSlug.value = true
      window.scrollTo({ top: 0 })
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="rw min-h-screen">
    <!-- Header minimal -->
    <header class="border-b border-[#EFE7D8] bg-[#FBF7F0]">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
            <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
            <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
            <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <span class="rw-serif text-xl text-[#0E1B2C]">Ridewiz</span>
        </NuxtLink>
        <NuxtLink to="/dashboard/login" class="text-sm font-semibold text-[#6C7889] hover:text-[#B5793F]">
          Déjà un compte ? <span class="text-[#B5793F]">Se connecter</span>
        </NuxtLink>
      </div>
    </header>

    <div class="mx-auto max-w-xl px-5 py-8 sm:py-12">
      <!-- Titre + réassurance -->
      <div class="text-center">
        <h1 class="rw-serif text-3xl text-[#0E1B2C] sm:text-4xl">Créez votre page chauffeur</h1>
        <p class="mt-3 text-[15px] text-[#6C7889]">
          2 minutes suffisent — tout le reste se complète plus tard, depuis votre espace.
        </p>
      </div>

      <!-- Étapes -->
      <div class="mx-auto mt-7 flex max-w-xs items-center gap-3">
        <button
          type="button"
          class="flex flex-1 items-center gap-2.5"
          :class="step === 1 ? '' : 'opacity-100'"
          @click="step = 1"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
            :class="step === 1 ? 'bg-[#B5793F] text-white' : 'bg-[#2E7D5B] text-white'"
          >
            <template v-if="step === 1">1</template>
            <template v-else>✓</template>
          </span>
          <span class="whitespace-nowrap text-[13px] font-semibold" :class="step === 1 ? 'text-[#16283D]' : 'text-[#2E7D5B]'">Votre compte</span>
        </button>
        <span class="h-px flex-1 bg-[#E4DCCC]" />
        <div class="flex flex-1 items-center gap-2.5">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
            :class="step === 2 ? 'bg-[#B5793F] text-white' : 'bg-[#EDE4D3] text-[#9A8B72]'"
          >2</span>
          <span class="whitespace-nowrap text-[13px] font-semibold" :class="step === 2 ? 'text-[#16283D]' : 'text-[#9A8B72]'">Votre profil</span>
        </div>
      </div>

      <p v-if="errorMsg" class="mt-6 rounded-xl border border-[#B23A3A]/30 bg-[#F4E1E1] px-4 py-3 text-sm font-medium text-[#B23A3A]">
        {{ errorMsg }}
      </p>

      <!-- ═══════ Étape 1 : l'essentiel ═══════ -->
      <form v-if="step === 1" class="mt-6 space-y-5" @submit.prevent="goToStep2">
        <div class="rw-card space-y-5">
          <div>
            <label class="rw-lbl" for="displayName">Votre nom de chauffeur <span class="text-[#B5793F]">*</span></label>
            <input
              id="displayName"
              v-model="form.displayName"
              type="text"
              class="rw-field"
              :class="fieldErrors.displayName ? 'rw-field-error' : ''"
              maxlength="120"
              placeholder="Ex : Karim — VTC Paris"
              autocomplete="name"
            />
            <p v-if="fieldErrors.displayName" class="rw-err">{{ fieldErrors.displayName }}</p>

            <!-- Aperçu en direct de l'adresse de la page -->
            <div v-if="form.slug" class="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#F6F1E9] px-4 py-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2E7D5B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/></svg>
              <span class="text-[13px] text-[#6C7889]">Votre page :</span>
              <span class="font-mono text-[13px] font-semibold text-[#16283D]">{{ appHost }}/<span class="text-[#B5793F]">{{ form.slug }}</span></span>
              <button
                v-if="!editingSlug"
                type="button"
                class="-m-2 ml-auto p-2 text-[12px] font-semibold text-[#B5793F] hover:underline"
                @click="editingSlug = true"
              >
                Modifier
              </button>
            </div>
            <div v-if="editingSlug" class="mt-2">
              <input
                id="slug"
                v-model="form.slug"
                type="text"
                class="rw-field"
                :class="fieldErrors.slug ? 'rw-field-error' : ''"
                maxlength="60"
                placeholder="karim-paris"
                @input="onSlugInput"
              />
              <p class="rw-hint">Minuscules, chiffres et tirets uniquement.</p>
            </div>
            <p v-if="fieldErrors.slug" class="rw-err">{{ fieldErrors.slug }}</p>
          </div>

          <div>
            <label class="rw-lbl" for="email">Email <span class="text-[#B5793F]">*</span></label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              class="rw-field"
              :class="fieldErrors.email ? 'rw-field-error' : ''"
              placeholder="vous@exemple.fr"
              autocomplete="email"
            />
            <p v-if="fieldErrors.email" class="rw-err">{{ fieldErrors.email }}</p>
          </div>

          <div>
            <label class="rw-lbl" for="password">Mot de passe <span class="text-[#B5793F]">*</span></label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="rw-field !pr-20"
                :class="fieldErrors.password ? 'rw-field-error' : ''"
                minlength="8"
                placeholder="8 caractères minimum"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-[12px] font-semibold text-[#B5793F] hover:underline"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? 'Masquer' : 'Afficher' }}
              </button>
            </div>
            <p v-if="fieldErrors.password" class="rw-err">{{ fieldErrors.password }}</p>
          </div>
        </div>

        <button type="submit" class="rw-btn w-full !py-4 !text-[15px]">Continuer</button>

        <p class="text-center text-[13px] text-[#9A8B72]">
          ✓ Sans engagement &nbsp;·&nbsp; ✓ Zéro commission sur vos courses
        </p>
      </form>

      <!-- ═══════ Étape 2 : le profil (optionnel) ═══════ -->
      <form v-else class="mt-6 space-y-5" @submit.prevent="register">
        <p class="rounded-xl bg-[#F6F1E9] px-4 py-3 text-[13px] text-[#6C7889]">
          💡 Tout est <strong class="text-[#16283D]">optionnel</strong> ici — vous pourrez compléter ou
          modifier chaque information plus tard depuis votre espace.
        </p>

        <div class="rw-card space-y-5">
          <div class="rw-sect">Contact</div>
          <div>
            <label class="rw-lbl" for="phone">Téléphone</label>
            <input id="phone" v-model="form.phone" type="tel" class="rw-field" maxlength="30" placeholder="+33 6 00 00 00 00" autocomplete="tel" />
          </div>
          <div>
            <label class="rw-lbl" for="tagline">Votre accroche (1 ligne)</label>
            <input id="tagline" v-model="form.tagline" type="text" class="rw-field" maxlength="200" placeholder="Chauffeur VTC premium en Île-de-France" />
          </div>
        </div>

        <div class="rw-card space-y-5">
          <div class="rw-sect">Votre véhicule</div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="rw-lbl" for="vehicleMake">Marque</label>
              <input id="vehicleMake" v-model="form.vehicleMake" type="text" class="rw-field" maxlength="60" placeholder="Mercedes" />
            </div>
            <div>
              <label class="rw-lbl" for="vehicleModel">Modèle</label>
              <input id="vehicleModel" v-model="form.vehicleModel" type="text" class="rw-field" maxlength="60" placeholder="Classe E" />
            </div>
            <div>
              <label class="rw-lbl" for="vehicleClass">Catégorie</label>
              <input id="vehicleClass" v-model="form.vehicleClass" type="text" class="rw-field" maxlength="60" placeholder="Berline, Van…" />
            </div>
            <div>
              <label class="rw-lbl" for="vehicleSeats">Places</label>
              <input id="vehicleSeats" v-model.number="form.vehicleSeats" type="number" class="rw-field" min="1" max="20" placeholder="4" />
            </div>
          </div>
        </div>

        <div class="rw-card space-y-5">
          <div class="rw-sect">Zone &amp; prestations</div>
          <div>
            <label class="rw-lbl" for="serviceArea">Zone desservie</label>
            <input id="serviceArea" v-model="form.serviceArea" type="text" class="rw-field" maxlength="500" placeholder="Île-de-France, aéroports CDG et Orly…" />
          </div>
          <div>
            <label class="rw-lbl" for="services">Vos prestations</label>
            <textarea id="services" v-model="form.services" class="rw-field min-h-[88px]" maxlength="1000" placeholder="Transferts aéroport, mise à disposition, mariage…" />
          </div>
        </div>

        <button type="submit" class="rw-btn w-full !py-4 !text-[15px]" :disabled="loading">
          {{ loading ? 'Création du compte…' : 'Créer mon compte chauffeur' }}
        </button>
        <button
          type="button"
          class="w-full py-3 text-center text-sm font-semibold text-[#B5793F] hover:underline disabled:opacity-50"
          :disabled="loading"
          @click="register"
        >
          Passer cette étape et créer mon compte →
        </button>

        <button type="button" class="w-full py-3 text-center text-[13px] text-[#9A8B72] hover:text-[#6C7889]" @click="step = 1">
          ← Revenir à l'étape précédente
        </button>
      </form>

      <p class="mt-8 text-center text-[13px] leading-relaxed text-[#9A8B72]">
        Après votre inscription, notre équipe vérifie votre profil (sous 48 h).<br />
        Vous accédez tout de suite à votre espace pour le personnaliser.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Charte Ridewiz « Signature » — styles scopés au formulaire d'inscription. */
.rw {
  background: #fbf7f0;
  color: #16283d;
  font-family: 'DM Sans', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.rw-serif {
  font-family: 'DM Serif Display', serif;
  font-weight: 500;
  letter-spacing: -0.02em;
}
.rw-card {
  background: #fff;
  border: 1px solid #efe7d8;
  border-radius: 20px;
  padding: 24px;
}
.rw-sect {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #9a8b72;
}
.rw-lbl {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #3c4a5a;
}
.rw-field {
  width: 100%;
  padding: 13px 14px;
  border: 1.5px solid #e4dccc;
  border-radius: 12px;
  background: #fff;
  font-family: 'DM Sans', sans-serif;
  /* 16px minimum : sous ce seuil, iOS Safari zoome automatiquement au focus. */
  font-size: 16px;
  color: #16283d;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.rw-field::placeholder {
  color: #b3a488;
}
.rw-field:focus {
  border-color: #b5793f;
  box-shadow: 0 0 0 3px rgba(181, 121, 63, 0.15);
}
.rw-field-error {
  border-color: #b23a3a;
  background: #fcf3f3;
}
.rw-err {
  margin-top: 6px;
  font-size: 12px;
  color: #b23a3a;
}
.rw-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #9a8b72;
}
.rw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 22px;
  border-radius: 12px;
  background: #b5793f;
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.rw-btn:hover {
  background: #9c6431;
  box-shadow: 0 6px 16px -6px rgba(181, 121, 63, 0.6);
}
.rw-btn:disabled {
  background: #ede4d3;
  color: #b3a488;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
