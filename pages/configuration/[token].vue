<script setup lang="ts">
// Point d'entrée du lien de configuration envoyé par l'admin. Pas de mot de
// passe : le chauffeur demande un code (bouton, jamais automatique), le reçoit
// sur l'email de son compte, le saisit, et entre dans le parcours. Sur cet
// appareil il reste ensuite connecté : le lien rouvre directement le parcours.
// Un admin connecté qui teste le lien entre directement.
import { isCodeShape, normalizeCode, resendWaitSeconds } from '~/lib/setup-code'

definePageMeta({ layout: 'default' })
useHead({ title: 'Configuration de votre espace' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const token = String(route.params.token ?? '')

type Screen = 'loading' | 'ask' | 'code' | 'error'
const screen = ref<Screen>('loading')
const errorMsg = ref('')
const firstName = ref('')
const maskedEmail = ref('')
const busy = ref(false)
const code = ref('')
const codeInput = ref<HTMLInputElement | null>(null)
const codeError = ref('')

// Compte à rebours avant de pouvoir renvoyer un code.
const resendIn = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null
function startCountdown(seconds: number) {
  resendIn.value = seconds
  if (ticker) clearInterval(ticker)
  if (seconds <= 0) return
  ticker = setInterval(() => {
    resendIn.value -= 1
    if (resendIn.value <= 0 && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }, 1000)
}
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

function apiError(e: unknown, fallback: string): string {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || fallback
}

async function enter() {
  // Recharger l'état de session client (désormais DRIVER) AVANT de naviguer,
  // sinon le middleware du parcours lit une session vide et renvoie au login.
  await refreshSession()
  await navigateTo('/configuration', { replace: true })
}

onMounted(async () => {
  try {
    const res = await $fetch<
      | { opened: true }
      | { opened: false; firstName: string; maskedEmail: string; codeSentAt: string | null }
    >('/api/setup/open', { method: 'POST', body: { token } })
    if (res.opened) {
      await enter()
      return
    }
    firstName.value = res.firstName
    maskedEmail.value = res.maskedEmail
    // Retour sur la page avec un code encore frais (< 10 min) : on propose
    // directement la saisie, sans renvoyer d'email.
    const sentAt = res.codeSentAt ? new Date(res.codeSentAt) : null
    const fresh = sentAt && Date.now() - sentAt.getTime() < 10 * 60 * 1000
    if (fresh) {
      screen.value = 'code'
      startCountdown(resendWaitSeconds(sentAt))
      await nextTick()
      codeInput.value?.focus()
    } else {
      screen.value = 'ask'
    }
  } catch (e) {
    errorMsg.value = apiError(e, 'Ce lien n’est plus valide. Demandez-en un nouveau à votre administrateur.')
    screen.value = 'error'
  }
})

async function sendCode() {
  if (busy.value || resendIn.value > 0) return
  busy.value = true
  codeError.value = ''
  try {
    const res = await $fetch<{ resendAfterSeconds: number }>('/api/setup/send-code', {
      method: 'POST',
      body: { token },
    })
    code.value = ''
    screen.value = 'code'
    startCountdown(res.resendAfterSeconds)
    await nextTick()
    codeInput.value?.focus()
  } catch (e) {
    codeError.value = apiError(e, 'Envoi impossible pour le moment. Réessayez.')
    if (screen.value === 'ask') screen.value = 'code'
  } finally {
    busy.value = false
  }
}

const codeReady = computed(() => isCodeShape(normalizeCode(code.value)))

async function verify() {
  if (busy.value || !codeReady.value) return
  busy.value = true
  codeError.value = ''
  try {
    await $fetch('/api/setup/verify-code', {
      method: 'POST',
      body: { token, code: normalizeCode(code.value) },
    })
    await enter()
  } catch (e) {
    codeError.value = apiError(e, 'Code incorrect.')
    busy.value = false
    await nextTick()
    codeInput.value?.select()
  }
}

// Saisie : chiffres seulement, validation automatique au 6e chiffre.
function onCodeInput(e: Event) {
  const el = e.target as HTMLInputElement
  code.value = normalizeCode(el.value)
  el.value = code.value
  if (codeReady.value) verify()
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-sm items-center px-5 py-8">
    <div class="card w-full">
      <div class="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
          <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
          <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
          <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        <p class="font-serif text-lg text-slate-950">Ridewiz</p>
      </div>

      <!-- Chargement -->
      <template v-if="screen === 'loading'">
        <p class="mt-5 font-serif text-xl text-slate-900">Ouverture de votre espace…</p>
        <p class="mt-1 text-sm text-slate-500">Un instant.</p>
      </template>

      <!-- Demande du code (jamais envoyé sans ce clic) -->
      <template v-else-if="screen === 'ask'">
        <p class="mt-5 text-sm font-semibold uppercase tracking-wide text-brand-700">Bienvenue</p>
        <h1 class="mt-1 font-serif text-2xl text-slate-950">Bonjour {{ firstName }} 👋</h1>
        <p class="mt-3 text-slate-600">
          Pour ouvrir la configuration de votre espace, nous allons vous envoyer un code à
          <strong class="text-slate-900" data-testid="masked-email">{{ maskedEmail }}</strong>.
          Pas de mot de passe à retenir.
        </p>
        <button type="button" class="btn-primary mt-6 w-full" :disabled="busy" data-testid="send-code" @click="sendCode">
          {{ busy ? 'Envoi…' : '✉️ Recevoir mon code' }}
        </button>
        <p v-if="codeError" class="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">{{ codeError }}</p>
      </template>

      <!-- Saisie du code -->
      <template v-else-if="screen === 'code'">
        <h1 class="mt-5 font-serif text-2xl text-slate-950">Entrez votre code</h1>
        <p class="mt-2 text-sm text-slate-600">
          Nous l'avons envoyé à <strong class="text-slate-900">{{ maskedEmail }}</strong>.
          Pensez à vérifier vos courriers indésirables.
        </p>
        <form class="mt-5" @submit.prevent="verify">
          <label class="sr-only" for="setup-code">Code à 6 chiffres</label>
          <input
            id="setup-code"
            ref="codeInput"
            :value="code"
            class="field text-center font-mono text-2xl tracking-[0.5em]"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]*"
            maxlength="6"
            placeholder="······"
            data-testid="code-input"
            @input="onCodeInput"
          />
          <p v-if="codeError" class="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">{{ codeError }}</p>
          <button type="submit" class="btn-primary mt-4 w-full" :disabled="busy || !codeReady" data-testid="verify-code">
            {{ busy ? 'Vérification…' : 'Valider' }}
          </button>
        </form>
        <button
          type="button"
          class="mt-4 w-full text-center text-sm font-medium text-brand-700 hover:underline disabled:text-slate-400 disabled:no-underline"
          :disabled="busy || resendIn > 0"
          data-testid="resend-code"
          @click="sendCode"
        >
          {{ resendIn > 0 ? `Renvoyer un code (${resendIn} s)` : 'Je n’ai rien reçu, renvoyer un code' }}
        </button>
      </template>

      <!-- Lien invalide -->
      <template v-else>
        <p class="mt-5 font-serif text-xl text-slate-950">Lien indisponible</p>
        <p class="mt-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
        <NuxtLink to="/dashboard/login" class="btn-ghost mt-5 w-full">Me connecter autrement</NuxtLink>
      </template>
    </div>
  </div>
</template>
