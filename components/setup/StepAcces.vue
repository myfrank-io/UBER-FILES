<script setup lang="ts">
// Étape « Mot de passe » : proposée aux sessions ouvertes par le lien de
// configuration quand le compte n'en a pas encore. Permet de revenir plus tard
// par la page de connexion classique.
import { setupApiError } from '~/lib/setup-view'

const { state, result, next } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'acces'))
const email = computed(() => state.value?.driver.accountEmail ?? '')

const password = ref('')
const confirm = ref('')
const busy = ref(false)
const errorMsg = ref('')
const valid = computed(() => password.value.length >= 8 && password.value === confirm.value)

async function save() {
  if (password.value.length < 8) {
    errorMsg.value = 'Le mot de passe doit contenir au moins 8 caractères.'
    return
  }
  if (password.value !== confirm.value) {
    errorMsg.value = 'Les deux mots de passe ne correspondent pas.'
    return
  }
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/setup/password', { method: 'POST', body: { password: password.value } })
    password.value = ''
    confirm.value = ''
    await next()
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
    icon="🔑"
    title="Votre accès"
    subtitle="Choisissez un mot de passe pour retrouver votre espace à tout moment, depuis n'importe quel appareil."
    :done="step?.done"
  >
    <div v-if="step?.done" class="rounded-2xl border border-green-200 bg-green-50 p-4">
      <p class="font-semibold text-green-900">✅ Mot de passe enregistré</p>
      <p class="mt-1 text-sm text-green-800">Connectez-vous sur <strong>ridewiz.fr/dashboard/login</strong> avec <strong>{{ email }}</strong>.</p>
    </div>

    <form v-else class="space-y-4" @submit.prevent="save">
      <div>
        <label class="label">Votre identifiant</label>
        <input class="field bg-slate-50" :value="email" readonly />
      </div>
      <div>
        <label class="label" for="setup-password">Mot de passe</label>
        <input id="setup-password" v-model="password" type="password" class="field" minlength="8" autocomplete="new-password" data-testid="password" />
        <p class="mt-1 text-xs text-slate-500">8 caractères minimum.</p>
      </div>
      <div>
        <label class="label" for="setup-password-confirm">Confirmez-le</label>
        <input id="setup-password-confirm" v-model="confirm" type="password" class="field" minlength="8" autocomplete="new-password" data-testid="password-confirm" />
      </div>
    </form>

    <template #actions>
      <SetupActions
        :busy="busy"
        :disabled="!step?.done && !valid"
        :error="errorMsg"
        :next-label="step?.done ? 'Continuer' : 'Enregistrer mon mot de passe'"
        @next="step?.done ? goNext() : save()"
      />
    </template>
  </SetupStepShell>
</template>
