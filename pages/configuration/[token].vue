<script setup lang="ts">
// Point d'entrée du lien de configuration envoyé par l'admin : le jeton ouvre
// une session chauffeur, puis on bascule sur le parcours. Rien à saisir.
definePageMeta({ layout: 'default' })
useHead({ title: 'Configuration de votre espace' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const errorMsg = ref('')

onMounted(async () => {
  const token = String(route.params.token ?? '')
  try {
    await $fetch('/api/setup/open', { method: 'POST', body: { token } })
    // Recharger l'état de session client (désormais DRIVER) AVANT de naviguer,
    // sinon le middleware du parcours lit une session vide et renvoie au login.
    await refreshSession()
    await navigateTo('/configuration', { replace: true })
  } catch (e) {
    errorMsg.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage
      || 'Ce lien n’est plus valide. Demandez-en un nouveau à votre administrateur.'
  }
})
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-sm items-center px-5">
    <div class="card w-full text-center">
      <svg class="mx-auto" width="36" height="36" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
        <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
        <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
        <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
      </svg>
      <template v-if="!errorMsg">
        <p class="mt-4 font-serif text-xl text-slate-900">Ouverture de votre espace…</p>
        <p class="mt-1 text-sm text-slate-500">Un instant.</p>
      </template>
      <template v-else>
        <p class="mt-4 font-serif text-xl text-slate-900">Lien indisponible</p>
        <p class="mt-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
        <NuxtLink to="/dashboard/login" class="btn-ghost mt-5 w-full">Me connecter autrement</NuxtLink>
      </template>
    </div>
  </div>
</template>
