<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Nouveau mot de passe' })

const route = useRoute()
const token = computed(() => route.query.token as string | undefined)

const password = ref('')
const confirm = ref('')
const errorMsg = ref('')
const success = ref(false)
const loading = ref(false)

async function submit() {
  if (password.value !== confirm.value) {
    errorMsg.value = 'Les mots de passe ne correspondent pas.'
    return
  }
  if (!token.value) {
    errorMsg.value = 'Lien invalide.'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    success.value = true
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || 'Une erreur est survenue.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-sm items-center px-5">
    <div class="card w-full space-y-4">
      <h1 class="text-xl font-bold text-slate-900">Nouveau mot de passe</h1>

      <div v-if="!token" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Lien invalide. <NuxtLink to="/auth/forgot-password" class="underline">Refaire une demande</NuxtLink>.
      </div>

      <div v-else-if="success" class="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        Mot de passe mis à jour.
        <NuxtLink to="/dashboard/login" class="underline">Se connecter</NuxtLink>.
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="label" for="password">Nouveau mot de passe</label>
          <input id="password" v-model="password" type="password" class="field" minlength="8" required />
          <p class="mt-1 text-xs text-slate-400">Minimum 8 caractères</p>
        </div>
        <div>
          <label class="label" for="confirm">Confirmer le mot de passe</label>
          <input id="confirm" v-model="confirm" type="password" class="field" minlength="8" required />
        </div>
        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Enregistrement…' : 'Enregistrer le mot de passe' }}
        </button>
      </form>
    </div>
  </div>
</template>
