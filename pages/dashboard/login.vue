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
  <div class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-5">
    <NuxtLink to="/" class="mb-6 flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
        <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
        <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
        <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
      </svg>
      <span class="font-serif text-2xl font-medium tracking-tight text-slate-950">Ridewiz</span>
    </NuxtLink>
    <form class="card w-full space-y-4" @submit.prevent="login">
      <h1 class="font-serif text-xl font-medium tracking-tight text-slate-900">Espace chauffeur</h1>
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
      <p class="text-center text-sm">
        <NuxtLink to="/auth/forgot-password" class="text-brand-700 hover:underline text-xs">
          Mot de passe oublié ?
        </NuxtLink>
      </p>
    </form>
    <p class="mt-5 text-center text-sm text-slate-500">
      Pas encore de compte ?
      <NuxtLink to="/inscription" class="font-semibold text-brand-700 hover:underline">Devenir chauffeur</NuxtLink>
    </p>
  </div>
</template>
