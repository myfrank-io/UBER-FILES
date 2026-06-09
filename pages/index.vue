<script setup lang="ts">
// Page d'accueil de la plateforme (présentation produit + accès back-office).
useHead({ title: 'Réservation VTC — Plateforme pour chauffeurs privés' })

const steps = [
  { title: 'Demandez', text: 'Saisissez votre trajet ou votre mise à disposition.' },
  { title: 'Devis validé', text: 'Le chauffeur confirme le prix, vous recevez le lien de paiement.' },
  { title: 'Payez & confirmez', text: 'Le créneau est bloqué dans son agenda après paiement.' },
]
</script>

<template>
  <div class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50 to-slate-50" />
    <header class="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <span class="flex items-center gap-2 text-lg font-bold text-slate-900">
        <svg
          class="h-6 w-6 text-brand-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"
          />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        </svg>
        Réservation VTC
      </span>
      <NuxtLink to="/dashboard/login" class="text-sm font-semibold text-brand-700 hover:underline">
        Espace chauffeur →
      </NuxtLink>
    </header>

    <section class="relative mx-auto max-w-4xl px-6 py-16 text-center sm:py-24">
      <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        Votre clientèle privée,<br /><span class="text-brand-600">sans intermédiaire.</span>
      </h1>
      <p class="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
        Chaque chauffeur dispose de sa page de réservation à son nom. Devis instantané,
        validation du chauffeur, paiement sécurisé, créneau garanti dans son agenda.
      </p>

      <div class="mt-12 grid gap-5 text-left sm:grid-cols-3">
        <div v-for="(s, i) in steps" :key="s.title" class="card">
          <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
            {{ i + 1 }}
          </div>
          <h3 class="font-semibold text-slate-900">{{ s.title }}</h3>
          <p class="mt-1 text-sm text-slate-600">{{ s.text }}</p>
        </div>
      </div>

      <p class="mt-12 text-sm text-slate-500">
        Vous êtes chauffeur et avez reçu votre carte ?
        Votre page est accessible sur <code class="rounded bg-slate-200 px-1">/votre-nom</code>.
      </p>
    </section>
  </div>
</template>
