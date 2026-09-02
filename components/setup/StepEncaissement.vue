<script setup lang="ts">
// Étape « Encaissement » : connecter SumUp (clé API) pour recevoir les
// paiements en ligne — avec le guide pas à pas. Stripe en alternative si le
// compte est déjà réglé sur ce prestataire. Étape sautable (« Plus tard »).
import { setupApiError } from '~/lib/setup-view'

const { state, result, next, refresh } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'encaissement'))
const driver = computed(() => state.value?.driver)
const ready = computed(() => Boolean(step.value?.done))
const useStripe = computed(() => driver.value?.paymentProvider === 'STRIPE' || driver.value?.stripe.connected)

const apiKey = ref('')
const busy = ref(false)
const errorMsg = ref('')
const justConnected = ref(false)

async function connectSumup() {
  if (!apiKey.value.trim()) return
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/payments/sumup/api-key', { method: 'POST', body: { apiKey: apiKey.value.trim() } })
    apiKey.value = ''
    justConnected.value = true
    await refresh()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}

async function connectStripe() {
  busy.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ url: string }>('/api/dashboard/stripe/onboard', { method: 'POST', body: { returnTo: 'setup' } })
    if (res.url) window.location.href = res.url
  } catch (e) {
    errorMsg.value = setupApiError(e)
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
    icon="🏦"
    title="Recevoir les paiements en ligne"
    subtitle="Vous avez choisi de proposer le paiement en ligne : l'argent des courses arrive directement sur votre compte SumUp."
    :done="ready"
  >
    <div v-if="ready" class="rounded-2xl border border-green-200 bg-green-50 p-4" data-testid="payout-ready">
      <p class="font-semibold text-green-900">✅ {{ justConnected ? 'Compte connecté, bravo !' : 'Votre compte est connecté.' }}</p>
      <p class="mt-1 text-sm text-green-800">
        <template v-if="driver?.paymentProvider === 'SUMUP'">SumUp{{ driver?.sumup.viaApiKey ? ' (clé API)' : '' }} — l'encaissement en ligne est actif.</template>
        <template v-else>Stripe — l'encaissement en ligne est actif.</template>
      </p>
    </div>

    <template v-else-if="useStripe">
      <p class="text-sm text-slate-600">Votre compte utilise <strong>Stripe</strong>. Finalisez votre dossier Stripe : vous serez ramené ici ensuite.</p>
      <button type="button" class="btn-primary" :disabled="busy" @click="connectStripe">{{ busy ? 'Redirection…' : 'Continuer avec Stripe' }}</button>
    </template>

    <template v-else>
      <div class="rounded-2xl border border-slate-200 p-4">
        <ol class="space-y-3 text-sm text-slate-700">
          <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span><span>Depuis un <strong>ordinateur</strong>, connectez-vous sur <a href="https://me.sumup.com" target="_blank" rel="noopener" class="font-medium text-brand-700 underline">me.sumup.com</a> (pas l'application mobile).</span></li>
          <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span><span>Ouvrez votre profil → <strong>Paramètres</strong> → tout en bas, <strong>Pour les développeurs</strong> → <strong>Clés API</strong>.</span></li>
          <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">3</span><span>Cliquez sur <strong>Créer une clé API</strong>, nommez-la « Ridewiz ».</span></li>
          <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">4</span><span>Copiez la clé affichée (elle commence par <code class="rounded bg-slate-100 px-1">sup_sk_</code>) — elle n'est visible qu'une fois — et collez-la ci-dessous.</span></li>
        </ol>
      </div>

      <form class="space-y-3" @submit.prevent="connectSumup">
        <div>
          <label class="label" for="setup-sumup-key">Votre clé API SumUp</label>
          <input id="setup-sumup-key" v-model="apiKey" type="password" class="field font-mono" placeholder="sup_sk_…" autocomplete="off" data-testid="sumup-key" />
        </div>
        <button type="submit" class="btn-primary w-full sm:w-auto" :disabled="busy || !apiKey.trim()">
          {{ busy ? 'Vérification auprès de SumUp…' : 'Vérifier et connecter' }}
        </button>
      </form>

      <p class="text-xs text-slate-500">
        Pas encore de compte SumUp ? Créez-le gratuitement sur
        <a href="https://www.sumup.com/fr-fr/" target="_blank" rel="noopener" class="font-medium text-brand-700 underline">sumup.com</a>,
        puis revenez ici. En attendant, vos clients pourront réserver avec règlement sur place si vous l'avez autorisé.
      </p>
    </template>

    <template #help>
      <p>SumUp est le prestataire de paiement : vous êtes le commerçant, Ridewiz ne touche pas votre argent. La clé API permet à votre page de créer des paiements <em>vers votre compte</em>, rien d'autre.</p>
      <p>Si SumUp refuse la clé : vérifiez qu'elle est copiée en entier, et qu'elle a bien été créée depuis votre compte (pas un compte test).</p>
      <p>Vous pourrez la remplacer à tout moment dans <em>Réglages → Paiement</em>.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :error="errorMsg" :skippable="!ready" :next-label="ready ? 'Continuer' : 'Continuer'" :hide-next="!ready" @next="goNext" @skip="goNext" />
    </template>
  </SetupStepShell>
</template>
