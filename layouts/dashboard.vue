<script setup lang="ts">
// Layout du back-office chauffeur : navigation latérale (desktop) / barre basse (mobile).
const { user, clear } = useUserSession()

const nav = [
  { to: '/dashboard', label: 'Accueil', icon: '🏠' },
  { to: '/dashboard/calendrier', label: 'Calendrier', icon: '📅' },
  { to: '/dashboard/clients', label: 'Clients', icon: '👥' },
  { to: '/dashboard/parametres', label: 'Réglages', icon: '⚙️' },
]

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/dashboard/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-20 sm:flex sm:pb-0">
    <!-- Sidebar desktop -->
    <aside class="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 sm:block">
      <p class="text-lg font-bold text-slate-900">Réservation VTC</p>
      <p class="mt-1 truncate text-xs text-slate-400">{{ (user as { email?: string })?.email }}</p>
      <nav class="mt-6 space-y-1">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          active-class="bg-brand-50 text-brand-700"
        >
          <span>{{ item.icon }}</span>{{ item.label }}
        </NuxtLink>
      </nav>
      <button class="mt-6 text-sm text-slate-400 hover:text-slate-700" @click="logout">
        Déconnexion
      </button>
    </aside>

    <!-- Contenu -->
    <main class="flex-1 px-5 py-6 sm:px-8 sm:py-8">
      <slot />
    </main>

    <!-- Barre de navigation mobile -->
    <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white sm:hidden">
      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-slate-500"
        active-class="text-brand-700"
      >
        <span class="text-lg">{{ item.icon }}</span>{{ item.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
