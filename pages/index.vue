<script setup lang="ts">
// Page d'accueil avec une section hero.
useHead({
  title: 'UBER FILES — Accueil',
})

const features = [
  {
    title: 'Rapide',
    description: 'Propulsé par Nuxt 3 et Vite pour un rendu instantané.',
  },
  {
    title: 'Typé',
    description: 'TypeScript de bout en bout pour un code fiable.',
  },
  {
    title: 'Élégant',
    description: 'Une interface soignée grâce à Tailwind CSS.',
  },
]
</script>

<template>
  <section class="relative overflow-hidden">
    <!-- Dégradé de fond -->
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50 to-white"
      aria-hidden="true"
    />

    <div class="relative mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
      <span
        class="inline-flex items-center rounded-full border border-brand-500/20 bg-brand-50 px-4 py-1 text-sm font-medium text-brand-700"
      >
        Nuxt 3 · TypeScript · Tailwind CSS
      </span>

      <h1 class="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
        Gérez vos fichiers,<br />
        <span class="text-brand-600">simplement.</span>
      </h1>

      <p class="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
        UBER FILES est le point de départ d'une web app moderne et performante.
        Un squelette propre, prêt à accueillir vos idées.
      </p>

      <div class="mt-10 flex items-center justify-center gap-4">
        <NuxtLink
          to="/about"
          class="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          Commencer
        </NuxtLink>
        <a
          href="https://nuxt.com"
          target="_blank"
          rel="noopener"
          class="rounded-lg px-6 py-3 text-sm font-semibold text-slate-700 transition hover:text-brand-600"
        >
          Documentation →
        </a>
      </div>
    </div>

    <!-- Cartes de fonctionnalités -->
    <div class="relative mx-auto max-w-6xl px-6 pb-24">
      <div class="grid gap-6 sm:grid-cols-3">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h3 class="text-lg font-semibold text-slate-900">{{ feature.title }}</h3>
          <p class="mt-2 text-sm text-slate-600">{{ feature.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
