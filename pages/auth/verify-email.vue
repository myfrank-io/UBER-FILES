<script setup lang="ts">
// Page de confirmation de l'adresse email : le chauffeur y arrive via le lien
// reçu par email. On vérifie le jeton au montage et on affiche le résultat.
definePageMeta({ layout: 'default' })
useHead({ title: 'Confirmation de votre email' })

const route = useRoute()
const token = computed(() => route.query.token as string | undefined)

const state = ref<'verifying' | 'success' | 'error'>('verifying')
const errorMsg = ref('')

onMounted(async () => {
  if (!token.value) {
    state.value = 'error'
    errorMsg.value = 'Lien invalide.'
    return
  }
  try {
    await $fetch('/api/auth/verify-email', { method: 'POST', body: { token: token.value } })
    state.value = 'success'
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || 'Ce lien n’est plus valide.'
    state.value = 'error'
  }
})
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-sm items-center px-5">
    <div class="card w-full space-y-4 text-center">
      <template v-if="state === 'verifying'">
        <p class="text-3xl">⏳</p>
        <h1 class="font-serif text-xl font-medium tracking-tight text-slate-900">Confirmation en cours…</h1>
        <p class="text-sm text-slate-500">Merci de patienter quelques instants.</p>
      </template>

      <template v-else-if="state === 'success'">
        <p class="text-3xl">✅</p>
        <h1 class="font-serif text-xl font-medium tracking-tight text-slate-900">Adresse email confirmée</h1>
        <p class="text-sm text-slate-600">
          Merci ! Votre adresse email est vérifiée. Vous pouvez accéder à votre espace chauffeur.
        </p>
        <NuxtLink to="/dashboard" class="btn-primary inline-block w-full">Accéder à mon espace</NuxtLink>
      </template>

      <template v-else>
        <p class="text-3xl">⚠️</p>
        <h1 class="font-serif text-xl font-medium tracking-tight text-slate-900">Lien non valide</h1>
        <p class="text-sm text-slate-600">{{ errorMsg }}</p>
        <p class="text-sm text-slate-500">
          Connectez-vous à votre espace : vous pourrez y renvoyer un nouveau lien de confirmation.
        </p>
        <NuxtLink to="/dashboard/login" class="btn-primary inline-block w-full">Se connecter</NuxtLink>
      </template>
    </div>
  </div>
</template>
