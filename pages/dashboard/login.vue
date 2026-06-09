<script setup lang="ts">
// Connexion au back-office (chauffeur ou admin).
definePageMeta({ layout: 'default' })
useHead({ title: 'Connexion — Espace chauffeur' })

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const loading = ref(false)
const { fetch: refreshSession } = useUserSession()

async function login() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ role: string }>('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    await refreshSession()
    await navigateTo(res.role === 'ADMIN' ? '/admin' : '/dashboard')
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || 'Connexion impossible.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-sm items-center px-5">
    <form class="card w-full space-y-4" @submit.prevent="login">
      <h1 class="text-xl font-bold text-slate-900">Espace chauffeur</h1>
      <div>
        <label class="label" for="email">Email</label>
        <input id="email" v-model="email" type="email" class="field" required />
      </div>
      <div>
        <label class="label" for="password">Mot de passe</label>
        <input id="password" v-model="password" type="password" class="field" required />
      </div>
      <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="loading">
        {{ loading ? 'Connexion…' : 'Se connecter' }}
      </button>
      <p class="text-center text-xs text-slate-400">Démo : karim@example.com / password123</p>
    </form>
  </div>
</template>
