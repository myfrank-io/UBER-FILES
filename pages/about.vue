<script setup lang="ts">
// Page « À propos ».
useHead({
  title: 'UBER FILES — À propos',
})

const stack = [
  { name: 'Nuxt 3', detail: 'Framework Vue 3 avec rendu universel.' },
  { name: 'TypeScript', detail: 'Typage statique pour un code robuste.' },
  { name: 'Tailwind CSS', detail: 'Utilitaires CSS pour un design rapide.' },
]
</script>

<template>
  <section class="mx-auto max-w-3xl px-6 py-20">
    <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
      À propos d'UBER FILES
    </h1>

    <p class="mt-6 text-lg text-slate-600">
      UBER FILES est un squelette de web app moderne. Il fournit une base
      solide et bien structurée pour démarrer rapidement un nouveau projet,
      en s'appuyant sur les meilleurs outils de l'écosystème Vue.
    </p>

    <h2 class="mt-12 text-xl font-bold text-slate-900">La stack technique</h2>
    <ul class="mt-6 space-y-4">
      <li
        v-for="item in stack"
        :key="item.name"
        class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <span class="mt-1 h-2 w-2 flex-none rounded-full bg-brand-600" aria-hidden="true" />
        <div>
          <p class="font-semibold text-slate-900">{{ item.name }}</p>
          <p class="text-sm text-slate-600">{{ item.detail }}</p>
        </div>
      </li>
    </ul>

    <div class="mt-12">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
      >
        ← Retour à l'accueil
      </NuxtLink>
    </div>
  </section>
</template>
