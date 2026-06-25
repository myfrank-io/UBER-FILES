<script setup lang="ts">
// Page d'accueil de la plateforme (présentation produit + inscription / accès chauffeur).
useHead({ title: 'Réservation VTC — Plateforme pour chauffeurs privés' })

const clientSteps = [
  { title: 'Demandez', text: 'Saisissez votre trajet ou votre mise à disposition.' },
  { title: 'Devis validé', text: 'Le chauffeur confirme le prix, vous recevez le lien de paiement.' },
  { title: 'Payez & confirmez', text: 'Le créneau est bloqué dans son agenda après paiement.' },
]

// Parcours d'onboarding chauffeur : inscription → personnalisation → validation → mise en ligne.
const driverSteps = [
  { title: 'Inscrivez-vous', text: 'Créez votre compte et renseignez toutes vos informations.' },
  { title: 'Personnalisez', text: 'Composez votre page : présentation, véhicule, tarifs, zone desservie.' },
  { title: 'Validation', text: 'Notre équipe vérifie votre profil et l’approuve.' },
  { title: 'En ligne', text: 'Votre page de réservation à votre nom devient utilisable.' },
]
</script>

<template>
  <div class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50 to-slate-50" />
    <header class="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <span class="text-lg font-bold text-slate-900">
        Réservation VTC
      </span>
      <div class="flex items-center gap-3 sm:gap-5">
        <NuxtLink to="/dashboard/login" class="text-sm font-semibold text-brand-700 hover:underline">
          Se connecter
        </NuxtLink>
        <NuxtLink to="/inscription" class="btn-primary !px-4 !py-2 !text-sm">
          Devenir chauffeur
        </NuxtLink>
      </div>
    </header>

    <section class="relative mx-auto max-w-4xl px-6 py-16 text-center sm:py-24">
      <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        Votre clientèle privée,<br /><span class="text-brand-600">sans intermédiaire.</span>
      </h1>
      <p class="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
        Chaque chauffeur dispose de sa page de réservation à son nom. Devis instantané,
        validation du chauffeur, paiement sécurisé, créneau garanti dans son agenda.
      </p>

      <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <NuxtLink to="/inscription" class="btn-primary w-full sm:w-auto">
          Devenir chauffeur partenaire
        </NuxtLink>
        <NuxtLink to="/dashboard/login" class="btn-ghost w-full sm:w-auto">
          J’ai déjà un compte
        </NuxtLink>
      </div>

      <div class="mt-12 grid gap-5 text-left sm:grid-cols-3">
        <div v-for="(s, i) in clientSteps" :key="s.title" class="card">
          <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
            {{ i + 1 }}
          </div>
          <h3 class="font-semibold text-slate-900">{{ s.title }}</h3>
          <p class="mt-1 text-sm text-slate-600">{{ s.text }}</p>
        </div>
      </div>
    </section>

    <!-- Onboarding chauffeur -->
    <section class="relative mx-auto max-w-5xl px-6 pb-20">
      <div class="card bg-white/80">
        <div class="text-center">
          <h2 class="text-2xl font-bold text-slate-900">Vous êtes chauffeur VTC ?</h2>
          <p class="mx-auto mt-2 max-w-2xl text-slate-600">
            Inscrivez-vous, renseignez vos informations et personnalisez votre espace.
            Votre profil est soumis à validation : une fois approuvé, votre page de
            réservation est mise en ligne et prête à recevoir vos clients.
          </p>
        </div>

        <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="(s, i) in driverSteps" :key="s.title" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
              {{ i + 1 }}
            </div>
            <h3 class="font-semibold text-slate-900">{{ s.title }}</h3>
            <p class="mt-1 text-sm text-slate-600">{{ s.text }}</p>
          </div>
        </div>

        <div class="mt-8 text-center">
          <NuxtLink to="/inscription" class="btn-primary">
            Créer mon profil chauffeur
          </NuxtLink>
        </div>
      </div>

      <p class="mt-10 text-center text-sm text-slate-500">
        Vous êtes chauffeur et avez déjà votre page ?
        Elle est accessible sur <code class="rounded bg-slate-200 px-1">/votre-nom</code>.
      </p>
    </section>
  </div>
</template>
