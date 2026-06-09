<script setup lang="ts">
// Layout par défaut : header de navigation + contenu + footer.
const navigation = [
  { name: 'Accueil', to: '/' },
  { name: 'À propos', to: '/about' },
]
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white text-slate-800">
    <AppHeader :navigation="navigation" />

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-slate-200 bg-slate-50">
      <div class="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-slate-500">
        © {{ new Date().getFullYear() }} UBER FILES — Construit avec Nuxt 3 &amp; Tailwind CSS.
      </div>
    </footer>
  </div>
</template>
