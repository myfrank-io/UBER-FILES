<script setup lang="ts">
// Parcours de configuration guidée : un écran par étape, mobile d'abord. Les
// étapes déjà faites sont sautées (et restent accessibles depuis la frise pour
// modifier). La logique « fait / à faire / suivant » vit dans lib/setup-flow.
import {
  computeSetup,
  firstIncompleteStep,
  nextStepAfter,
  previousStep,
  visibleSteps,
  type SetupStepKey,
} from '~/lib/setup-flow'
import type { SetupStateView } from '~/lib/setup-view'

definePageMeta({ layout: 'default', middleware: 'dashboard' })
useHead({ title: 'Configuration de mon espace' })

const route = useRoute()
const router = useRouter()
const { session, fetch: refreshSession } = useUserSession()

const { data: state, refresh: refreshState } = await useFetch<SetupStateView>('/api/setup/state', {
  lazy: true,
})

const result = computed(() => (state.value ? computeSetup(state.value.snapshot) : null))
const setupSession = computed(() => Boolean(state.value?.snapshot.setupSession))

// Étape courante. Au chargement : l'étape demandée dans l'URL (retour Stripe,
// lien direct), sinon l'écran d'accueil.
const STEP_KEYS: (SetupStepKey | 'intro')[] = [
  'intro', 'identite', 'contact', 'vehicule', 'tarifs', 'annulation', 'paiement',
  'encaissement', 'google', 'telegram', 'carte', 'acces', 'recap',
]
function stepFromQuery(): SetupStepKey | 'intro' {
  const q = route.query.step
  if (typeof q === 'string' && STEP_KEYS.includes(q as SetupStepKey)) return q as SetupStepKey
  if (route.query.stripe) return 'encaissement'
  return 'intro'
}
const current = ref<SetupStepKey | 'intro'>(stepFromQuery())

function goTo(key: SetupStepKey | 'intro') {
  current.value = key
  router.replace({ query: key === 'intro' ? {} : { step: key } })
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function refresh() {
  await refreshState()
}

async function next() {
  await refreshState()
  if (!result.value) return
  const from = current.value === 'intro' ? 'identite' : current.value
  goTo(current.value === 'intro' ? firstIncompleteStep(result.value) : nextStepAfter(result.value, from))
}

function back() {
  if (!result.value || current.value === 'intro') return
  goTo(previousStep(result.value, current.value) ?? 'intro')
}

function start() {
  if (!result.value) return
  goTo(firstIncompleteStep(result.value))
}

provideSetupFlow({ state, result, current, refresh, next, back, goTo, setupSession })

// ─── Frise des étapes ────────────────────────────────────────────────────────

const STEP_META: Record<SetupStepKey, { label: string; icon: string }> = {
  identite: { label: 'Vous', icon: '👤' },
  contact: { label: 'Contact', icon: '📞' },
  vehicule: { label: 'Véhicule', icon: '🚗' },
  tarifs: { label: 'Tarifs', icon: '💶' },
  annulation: { label: 'Annulation', icon: '🗓️' },
  paiement: { label: 'Paiement', icon: '💳' },
  encaissement: { label: 'Encaissement', icon: '🏦' },
  google: { label: 'Avis Google', icon: '⭐' },
  telegram: { label: 'Telegram', icon: '💬' },
  carte: { label: 'Carte', icon: '🪪' },
  acces: { label: 'Mot de passe', icon: '🔑' },
  recap: { label: 'Terminer', icon: '🏁' },
}

const rail = computed(() => (result.value ? visibleSteps(result.value) : []))
const currentIndex = computed(() => rail.value.findIndex((s) => s.key === current.value))

// L'étape courante reste visible dans la frise (scroll horizontal sur mobile).
const railEl = ref<HTMLElement | null>(null)
watch([current, rail], async () => {
  await nextTick()
  const el = railEl.value?.querySelector<HTMLElement>('[data-current="true"]')
  el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
})

const firstName = computed(() => {
  const name = state.value?.driver.displayName?.trim() ?? ''
  return name.split(/\s+/)[0] || 'Bonjour'
})

// Usurpation admin : l'admin teste le lien / le parcours. Même retour que le
// bandeau du dashboard.
const impersonator = computed(
  () => (session.value as { impersonator?: { email: string } } | null)?.impersonator ?? null,
)
async function stopImpersonation() {
  await $fetch('/api/admin/stop-impersonation', { method: 'POST' })
  await refreshSession()
  await navigateTo('/admin')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 pb-16">
    <!-- En-tête : marque + progression -->
    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto max-w-2xl px-4 pt-3 sm:px-6">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <svg width="22" height="22" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
              <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
              <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
              <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <p class="truncate font-serif text-lg text-slate-950">Ridewiz</p>
            <span class="hidden text-sm text-slate-400 sm:inline">· Configuration</span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="result"
              class="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white"
              data-testid="setup-percent"
            >{{ result.percent }} %</span>
            <NuxtLink
              to="/dashboard"
              class="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Aller à mon espace complet"
            >Mon espace ↗</NuxtLink>
          </div>
        </div>

        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            class="h-full rounded-full bg-brand-600 transition-all duration-500"
            :style="{ width: `${result?.percent ?? 0}%` }"
          />
        </div>

        <!-- Frise des étapes -->
        <nav
          v-if="rail.length"
          ref="railEl"
          class="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-2.5 sm:-mx-6 sm:px-6 [scrollbar-width:none]"
          aria-label="Étapes"
        >
          <button
            v-for="(s, i) in rail"
            :key="s.key"
            type="button"
            :data-current="s.key === current"
            :data-step="s.key"
            class="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition"
            :class="s.key === current
              ? 'border-brand-600 bg-brand-600 text-white'
              : s.done
                ? 'border-green-200 bg-green-50 text-green-800'
                : i < currentIndex
                  ? 'border-slate-200 bg-white text-slate-500'
                  : 'border-slate-200 bg-white text-slate-500'"
            @click="goTo(s.key)"
          >
            <span v-if="s.done && s.key !== current" aria-hidden="true">✓</span>
            <span v-else aria-hidden="true">{{ STEP_META[s.key].icon }}</span>
            {{ STEP_META[s.key].label }}
          </button>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
      <div
        v-if="impersonator"
        class="mb-4 flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-1 pl-3.5 pr-1 text-xs text-indigo-900 sm:text-sm"
      >
        <p class="min-w-0 truncate">👁️ <strong>Mode admin</strong> — vous parcourez la configuration du chauffeur</p>
        <button class="flex min-h-[40px] shrink-0 items-center rounded-lg px-2.5 font-semibold text-indigo-700 hover:bg-indigo-100" @click="stopImpersonation">← Admin</button>
      </div>

      <div v-if="!state || !result" class="card animate-pulse">
        <div class="h-6 w-1/2 rounded bg-slate-100" />
        <div class="mt-4 h-4 w-3/4 rounded bg-slate-100" />
        <div class="mt-2 h-4 w-2/3 rounded bg-slate-100" />
      </div>

      <!-- Accueil du parcours -->
      <div v-else-if="current === 'intro'" class="card" data-testid="setup-intro">
        <p class="text-sm font-semibold uppercase tracking-wide text-brand-700">Bienvenue</p>
        <h1 class="mt-1 font-serif text-2xl text-slate-950 sm:text-3xl">
          {{ result.complete ? `Tout est prêt, ${firstName} 🎉` : `Bonjour ${firstName} 👋` }}
        </h1>
        <p class="mt-3 text-slate-600">
          <template v-if="result.complete">
            Votre espace Ridewiz est entièrement configuré. Vous pouvez revoir chaque
            réglage ci-dessous ou ouvrir votre espace.
          </template>
          <template v-else-if="result.requiredDone > 0">
            Reprenons là où vous en étiez : {{ result.requiredDone }} étape{{ result.requiredDone > 1 ? 's' : '' }} sur
            {{ result.requiredTotal }} déjà faite{{ result.requiredDone > 1 ? 's' : '' }}. Il ne vous reste que l'essentiel.
          </template>
          <template v-else>
            En quelques minutes, nous allons préparer votre espace ensemble : votre présentation,
            votre véhicule, vos tarifs et vos moyens de paiement. Tout s'enregistre automatiquement,
            vous pouvez fermer et revenir quand vous voulez.
          </template>
        </p>

        <ul class="mt-5 space-y-1.5">
          <li v-for="s in rail.filter((r) => r.key !== 'recap')" :key="s.key">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
              :class="s.done ? 'border-transparent bg-slate-50/70' : 'border-slate-200 bg-white hover:border-brand-300'"
              @click="goTo(s.key)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                :class="s.done ? 'bg-green-100 text-green-700' : 'bg-slate-100'"
              >{{ s.done ? '✓' : STEP_META[s.key].icon }}</span>
              <span class="min-w-0 flex-1 text-sm" :class="s.done ? 'text-slate-400' : 'text-slate-800'">
                {{ STEP_META[s.key].label }}
                <span v-if="s.optional" class="text-slate-400">(optionnel)</span>
              </span>
              <span class="text-xs text-slate-400">{{ s.done ? 'Modifier' : '→' }}</span>
            </button>
          </li>
        </ul>

        <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <NuxtLink v-if="result.complete" to="/dashboard" class="btn-ghost">Ouvrir mon espace</NuxtLink>
          <button class="btn-primary" data-testid="setup-start" @click="start">
            {{ result.complete ? 'Voir le récapitulatif' : result.requiredDone > 0 ? 'Reprendre' : 'Commencer' }}
          </button>
        </div>
      </div>

      <!-- Écrans -->
      <SetupStepIdentite v-else-if="current === 'identite'" />
      <SetupStepContact v-else-if="current === 'contact'" />
      <SetupStepVehicule v-else-if="current === 'vehicule'" />
      <SetupStepTarifs v-else-if="current === 'tarifs'" />
      <SetupStepAnnulation v-else-if="current === 'annulation'" />
      <SetupStepPaiement v-else-if="current === 'paiement'" />
      <SetupStepEncaissement v-else-if="current === 'encaissement'" />
      <SetupStepGoogle v-else-if="current === 'google'" />
      <SetupStepTelegram v-else-if="current === 'telegram'" />
      <SetupStepCarte v-else-if="current === 'carte'" />
      <SetupStepAcces v-else-if="current === 'acces'" />
      <SetupStepRecap v-else-if="current === 'recap'" />
    </main>
  </div>
</template>
