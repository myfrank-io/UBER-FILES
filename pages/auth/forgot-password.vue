<script setup lang="ts">
definePageMeta({ layout: 'default' })
useHead({ title: 'Mot de passe oublié' })

const email = ref('')
const errorMsg = ref('')
const success = ref(false)
const loading = ref(false)

async function submit() {
  loading.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
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
      <h1 class="text-xl font-bold text-slate-900">Mot de passe oublié</h1>

      <div v-if="success" class="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        Si un compte existe pour cet email, vous recevrez un lien de réinitialisation dans quelques minutes.
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <p class="text-sm text-slate-600">
          Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>
        <div>
          <label class="label" for="email">Email</label>
          <input id="email" v-model="email" type="email" class="field" required />
        </div>
        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Envoi…' : 'Envoyer le lien' }}
        </button>
      </form>

      <p class="text-center text-sm text-slate-500">
        <NuxtLink to="/dashboard/login" class="text-brand-700 hover:underline">Retour à la connexion</NuxtLink>
      </p>
    </div>
  </div>
</template>
