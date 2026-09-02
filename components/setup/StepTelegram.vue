<script setup lang="ts">
// Étape « Telegram » : recevoir chaque demande sur Telegram et la valider en
// un tap. Bouton → lien profond du bot, puis on interroge le serveur jusqu'à
// ce que le chauffeur ait appuyé sur DÉMARRER. Optionnelle.
import { setupApiError } from '~/lib/setup-view'

const { result, next, refresh } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'telegram'))

const busy = ref(false)
const errorMsg = ref('')
const deepLink = ref('')
let poll: ReturnType<typeof setInterval> | null = null

function stopPoll() {
  if (poll) clearInterval(poll)
  poll = null
}

function startPoll() {
  stopPoll()
  let elapsed = 0
  poll = setInterval(async () => {
    elapsed += 3
    try {
      const res = await $fetch<{ linked: boolean }>('/api/dashboard/telegram/status')
      if (res.linked) {
        stopPoll()
        deepLink.value = ''
        await refresh()
      }
    } catch {
      // on retente au prochain tick
    }
    if (elapsed >= 180) stopPoll()
  }, 3000)
}

async function connect() {
  busy.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ deepLink: string }>('/api/dashboard/telegram/connect', { method: 'POST' })
    deepLink.value = res.deepLink
    window.open(res.deepLink, '_blank')
    startPoll()
  } catch (e) {
    errorMsg.value = setupApiError(e, 'Connexion Telegram indisponible pour le moment.')
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(stopPoll)

async function goNext() {
  stopPoll()
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
    icon="💬"
    title="Vos demandes sur Telegram"
    subtitle="Chaque demande de course arrive en notification, avec les boutons Valider / Ajuster / Refuser. Pas besoin d'ouvrir votre espace."
    :done="step?.done"
  >
    <div v-if="step?.done" class="rounded-2xl border border-green-200 bg-green-50 p-4">
      <p class="font-semibold text-green-900">✅ Telegram connecté</p>
      <p class="mt-1 text-sm text-green-800">Vous recevrez vos demandes en temps réel.</p>
    </div>

    <template v-else>
      <ol class="space-y-2 text-sm text-slate-700">
        <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span><span>Installez Telegram sur votre téléphone si ce n'est pas déjà fait (gratuit).</span></li>
        <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">2</span><span>Appuyez sur le bouton ci-dessous : Telegram s'ouvre sur le bot Ridewiz.</span></li>
        <li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">3</span><span>Appuyez sur <strong>DÉMARRER</strong> dans Telegram. Revenez ici : c'est connecté automatiquement.</span></li>
      </ol>

      <button type="button" class="btn-primary w-full sm:w-auto" :disabled="busy" data-testid="telegram-connect" @click="connect">
        {{ busy ? '…' : deepLink ? 'Rouvrir Telegram' : '💬 Connecter Telegram' }}
      </button>
      <p v-if="deepLink" class="text-sm text-slate-600">
        En attente de votre appui sur DÉMARRER… Telegram ne s'est pas ouvert ?
        <a :href="deepLink" target="_blank" rel="noopener" class="font-medium text-brand-700 underline">Ouvrir le lien</a>.
      </p>
    </template>

    <template #help>
      <p>Sans Telegram, vous recevez tout par email et dans votre espace : rien n'est perdu. Telegram est simplement plus rapide au volant.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :error="errorMsg" :skippable="!step?.done" @next="goNext" @skip="goNext" />
    </template>
  </SetupStepShell>
</template>
