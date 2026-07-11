<script setup lang="ts">
// Carte « Finalisez votre configuration » (accueil du dashboard). Guide le
// chauffeur étape par étape avec une barre de progression. Disparaît une fois
// toutes les étapes OBLIGATOIRES faites (les optionnelles, ex. Telegram, ne
// bloquent pas le 100 %). La logique de complétion vit dans lib/onboarding.ts.
import { computeOnboarding, type OnboardingStepKey } from '~/lib/onboarding'

// useMe : clé partagée avec le layout (pas de requête en double) + cache de
// navigation (pas de rechargement à chaque retour sur l'accueil).
const { data: me } = await useMe()

const STEP_META: Record<OnboardingStepKey, { label: string; hint: string; href: string; icon: string }> = {
  profil: { label: 'Compléter mon profil', hint: 'Photo et présentation', href: '/dashboard/profil', icon: '👤' },
  vehicule: { label: 'Ajouter mon véhicule', hint: 'Marque, modèle, places', href: '/dashboard/profil', icon: '🚗' },
  zone: { label: 'Zone et contact', hint: 'Téléphone et zone desservie', href: '/dashboard/profil', icon: '📍' },
  tarifs: { label: 'Définir mes tarifs', hint: 'Au moins une grille (transfert ou horaire)', href: '/dashboard/parametres', icon: '💶' },
  paiement: { label: 'Choisir mes moyens de paiement', hint: 'En ligne et/ou sur place', href: '/dashboard/parametres', icon: '💳' },
  encaissement: { label: 'Activer l’encaissement', hint: 'Connecter SumUp ou Stripe', href: '/dashboard/parametres', icon: '🏦' },
  telegram: { label: 'Lier Telegram', hint: 'Notifications et validation en un tap', href: '/dashboard/parametres', icon: '💬' },
}

const onboarding = computed(() => {
  const m = me.value
  if (!m) return null
  return computeOnboarding({
    hasPhoto: Boolean(m.photoUrl),
    hasIntro: Boolean(m.bio || m.tagline),
    vehicleCount: m.vehicleCount ?? 0,
    hasPhone: Boolean(m.phone),
    hasServiceArea: Boolean(m.serviceArea),
    hasRates: (m.transferBands?.length ?? 0) > 0 || (m.hourlyTiers?.length ?? 0) > 0,
    paymentMethods: m.paymentMethods ?? [],
    onlinePayoutReady: Boolean(m.stripe?.connected || m.sumup?.connected),
    telegramLinked: Boolean(m.telegramLinked),
  })
})

// Le bandeau s'efface dès que tout l'obligatoire est fait.
const visible = computed(() => Boolean(onboarding.value) && !onboarding.value!.complete)

// Replié par défaut : le chauffeur garde un résumé compact (titre + progression)
// et déplie la checklist détaillée seulement s'il le souhaite.
const expanded = ref(false)
</script>

<template>
  <div
    v-if="visible && onboarding"
    class="card border-brand-100 bg-gradient-to-br from-brand-50/70 to-white !p-4"
  >
    <!-- En-tête cliquable une seule ligne : replie / déplie la checklist.
         Replié, la carte tient en ~70px sur mobile (titre + barre). -->
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <h2 class="min-w-0 truncate text-sm font-semibold text-slate-900">
        Finalisez votre configuration
      </h2>
      <div class="flex shrink-0 items-center gap-1.5">
        <span class="text-xs text-slate-400">{{ onboarding.requiredDone }}/{{ onboarding.requiredTotal }}</span>
        <span class="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
          {{ onboarding.percent }}%
        </span>
        <svg
          class="h-5 w-5 text-slate-400 transition-transform duration-200"
          :class="{ 'rotate-180': expanded }"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
    </button>

    <!-- Barre de progression : reste visible même replié (résumé compact). -->
    <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        class="h-full rounded-full bg-brand-600 transition-all duration-500"
        :style="{ width: `${onboarding.percent}%` }"
      />
    </div>

    <!-- Détail : masqué par défaut, affiché une fois déplié. -->
    <p v-if="expanded" class="mt-3 text-sm text-slate-500">
      Encore quelques étapes avant de recevoir vos premières réservations
      ({{ onboarding.requiredDone }} / {{ onboarding.requiredTotal }} étapes obligatoires).
    </p>
    <ul v-if="expanded" class="mt-3 space-y-1.5">
      <li v-for="step in onboarding.steps" :key="step.key">
        <NuxtLink
          :to="STEP_META[step.key].href"
          class="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition"
          :class="step.done
            ? 'border-transparent bg-slate-50/60'
            : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'"
        >
          <!-- Pastille d'état -->
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
            :class="step.done ? 'bg-green-100 text-green-700' : 'bg-slate-100'"
          >
            <template v-if="step.done">✓</template>
            <template v-else>{{ STEP_META[step.key].icon }}</template>
          </span>
          <span class="min-w-0 flex-1">
            <span
              class="block text-sm font-medium"
              :class="step.done ? 'text-slate-400 line-through' : 'text-slate-800'"
            >
              {{ STEP_META[step.key].label }}
              <span v-if="step.optional" class="font-normal text-slate-400">(optionnel)</span>
            </span>
            <span v-if="!step.done" class="block text-xs text-slate-400">{{ STEP_META[step.key].hint }}</span>
          </span>
          <span v-if="!step.done" class="shrink-0 text-slate-300">→</span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
