<script setup lang="ts">
// Récapitulatif : ce qui est fait, ce qui reste (avec accès direct), et la
// suite — ouvrir son espace, voir sa page.
import { visibleSteps, type SetupStepKey } from '~/lib/setup-flow'

const { state, result, goTo } = useSetupFlow()
const config = useRuntimeConfig()

const LABELS: Record<SetupStepKey, string> = {
  identite: 'Nom, accroche et photo',
  contact: 'Téléphone et email',
  vehicule: 'Véhicule',
  tarifs: 'Tarifs',
  annulation: 'Conditions d’annulation',
  paiement: 'Moyens de paiement',
  encaissement: 'Encaissement en ligne (SumUp)',
  google: 'Avis Google',
  telegram: 'Notifications Telegram',
  carte: 'Carte de visite digitale',
  acces: 'Mot de passe',
  recap: 'Récapitulatif',
}

const rows = computed(() => (result.value ? visibleSteps(result.value).filter((s) => s.key !== 'recap') : []))
const missingRequired = computed(() => rows.value.filter((s) => !s.done && !s.optional))
const driver = computed(() => state.value?.driver)
const publicUrl = computed(() => (driver.value ? `${config.public.appBaseUrl}/${driver.value.slug}` : ''))
</script>

<template>
  <SetupStepShell
    icon="🏁"
    :title="result?.complete ? 'Tout est prêt !' : 'Presque terminé'"
    :subtitle="result?.complete
      ? 'Votre espace est configuré. Il ne reste plus qu’à recevoir vos premières réservations.'
      : 'Voici où vous en êtes. Les étapes marquées « à compléter » sont nécessaires pour recevoir des réservations.'"
  >
    <ul class="space-y-1.5">
      <li v-for="s in rows" :key="s.key">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left"
          :class="s.done ? 'border-transparent bg-slate-50/70' : s.optional ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/60'"
          @click="goTo(s.key)"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm" :class="s.done ? 'bg-green-100 text-green-700' : s.optional ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-800'">
            {{ s.done ? '✓' : s.optional ? '–' : '!' }}
          </span>
          <span class="min-w-0 flex-1 text-sm" :class="s.done ? 'text-slate-500' : 'text-slate-900'">{{ LABELS[s.key] }}</span>
          <span class="shrink-0 text-xs font-medium" :class="s.done ? 'text-slate-400' : s.optional ? 'text-slate-500' : 'text-amber-800'">
            {{ s.done ? 'Modifier' : s.optional ? 'Passée' : 'À compléter →' }}
          </span>
        </button>
      </li>
    </ul>

    <div v-if="driver" class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">
      <template v-if="driver.status === 'ACTIVE'">
        <p class="font-semibold text-slate-900">Votre page de réservation est en ligne</p>
        <a :href="publicUrl" target="_blank" rel="noopener" class="mt-1 block break-all font-medium text-brand-700 underline">{{ publicUrl }} ↗</a>
        <p class="mt-2">Partagez ce lien à vos clients : ils y réservent en deux minutes.</p>
      </template>
      <template v-else-if="driver.status === 'PENDING'">
        <p class="font-semibold text-slate-900">Dernière étape : la mise en ligne</p>
        <p class="mt-1">Ridewiz vérifie votre profil et active votre page de réservation <strong>{{ publicUrl }}</strong>. Vous serez prévenu dès qu'elle est en ligne.</p>
      </template>
    </div>

    <template #actions>
      <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button v-if="missingRequired.length" type="button" class="btn-ghost" @click="goTo(missingRequired[0].key)">Compléter « {{ LABELS[missingRequired[0].key] }} »</button>
        <NuxtLink to="/dashboard" class="btn-primary" data-testid="setup-finish">Ouvrir mon espace →</NuxtLink>
      </div>
    </template>
  </SetupStepShell>
</template>
