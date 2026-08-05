<script setup lang="ts">
// Suivi de course côté client (page « Ma réservation ») : carte live plein
// cadre, ETA vivante, fiche chauffeur/véhicule et timeline des étapes.
// Autonome : polle /api/booking/{token}/tracking à une cadence adaptée à la
// phase (8 s pendant la course, 60 s dans les heures qui précèdent, rien sinon).
import { formatRideTime } from '~/lib/datetime'
import {
  etaMinutesLeft,
  isLivePhase,
  positionAgeSeconds,
  type RidePhase,
} from '~/lib/tracking'

const props = defineProps<{ token: string }>()

interface TrackingData {
  phase: RidePhase
  scheduledAt: string
  timezone: string
  steps: { departedAt: string | null; arrivedAt: string | null; pickedUpAt: string | null }
  etaAt: string | null
  driverPosition: { lat: number; lng: number; heading: number | null; at: string | null } | null
  polyline: string | null
  pickup: { lat: number; lng: number; address: string | null } | null
  dropoff: { lat: number; lng: number; address: string | null } | null
  driver: {
    displayName: string
    phone: string | null
    photoUrl: string | null
    vehicleLabel: string | null
    vehicleImage: string | null
    vehicleColor: string | null
  }
}

const { t, locale } = useI18n()
const dtLocale = computed(() => (locale.value === 'en' ? 'en' : 'fr'))

const { data, refresh } = useFetch<TrackingData>(`/api/booking/${props.token}/tracking`, {
  server: false,
})

// Horloge locale (compte à rebours ETA, fraîcheur de position) : tic toutes les 15 s.
const now = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null

const phase = computed<RidePhase | null>(() => data.value?.phase ?? null)
const live = computed(() => (phase.value ? isLivePhase(phase.value) : false))

// Cadence de polling selon la phase — null = pas de polling.
const pollMs = computed<number | null>(() => {
  if (!data.value) return null
  if (live.value) return 8_000
  if (phase.value === 'UPCOMING') {
    const untilRide = new Date(data.value.scheduledAt).getTime() - now.value.getTime()
    if (untilRide < 3 * 3_600_000) return 60_000
  }
  return null
})

let pollTimer: ReturnType<typeof setInterval> | null = null
watch(
  pollMs,
  (ms) => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = ms ? setInterval(() => refresh(), ms) : null
  },
  { immediate: true },
)

onMounted(() => {
  clockTimer = setInterval(() => (now.value = new Date()), 15_000)
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (clockTimer) clearInterval(clockTimer)
})

// Visible : phases live, course terminée, ou dernières 24 h avant la prise en
// charge (teaser « vous suivrez votre chauffeur ici »).
const visible = computed(() => {
  if (!data.value) return false
  if (live.value || phase.value === 'COMPLETED') return true
  if (phase.value !== 'UPCOMING') return false
  const untilRide = new Date(data.value.scheduledAt).getTime() - now.value.getTime()
  return untilRide < 24 * 3_600_000 && untilRide > -24 * 3_600_000
})

// ── ETA & fraîcheur de position ──
const etaTime = computed(() =>
  data.value?.etaAt ? formatRideTime(data.value.etaAt, data.value.timezone, dtLocale.value) : null,
)
const etaMinutes = computed(() => etaMinutesLeft(data.value?.etaAt, now.value))
const positionAgeMin = computed(() => {
  const s = positionAgeSeconds(data.value?.driverPosition?.at, now.value)
  return s == null ? null : Math.round(s / 60)
})
const positionFresh = computed(() => positionAgeMin.value != null && positionAgeMin.value < 2)

const phaseLabel = computed(() => {
  switch (phase.value) {
    case 'EN_ROUTE':
      return t('tracking.enRoute', { name: data.value?.driver.displayName })
    case 'ARRIVED':
      return t('tracking.arrivedTitle')
    case 'ON_BOARD':
      return t('tracking.onBoard')
    default:
      return ''
  }
})

const driverPhoneHref = computed(() => {
  const phone = data.value?.driver.phone
  return phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : null
})

const vehicleImageBroken = ref(false)

// ── Timeline des étapes ──
interface TimelineStep {
  key: string
  label: string
  at: string | null
  done: boolean
}
const steps = computed<TimelineStep[]>(() => {
  const d = data.value
  if (!d) return []
  return [
    { key: 'confirmed', label: t('tracking.stepConfirmed'), at: null, done: true },
    { key: 'departed', label: t('tracking.stepDeparted'), at: d.steps.departedAt, done: Boolean(d.steps.departedAt) },
    { key: 'arrived', label: t('tracking.stepArrived'), at: d.steps.arrivedAt, done: Boolean(d.steps.arrivedAt) },
    { key: 'onboard', label: t('tracking.stepOnBoard'), at: d.steps.pickedUpAt, done: Boolean(d.steps.pickedUpAt) },
    { key: 'done', label: t('tracking.stepCompleted'), at: null, done: d.phase === 'COMPLETED' },
  ]
})
// Étape « en cours » : la première non franchie (pulse dans la timeline).
const currentStepIndex = computed(() => steps.value.findIndex((s) => !s.done))
const showTimeline = computed(() => live.value || phase.value === 'COMPLETED')

function stepTime(step: TimelineStep): string | null {
  if (!step.at || !data.value) return null
  return formatRideTime(step.at, data.value.timezone, dtLocale.value)
}

// Partage du lien de suivi (à la personne qui attend le client à destination).
const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator !== 'undefined' && Boolean(navigator.share)
})
async function share() {
  try {
    await navigator.share({ title: t('tracking.shareTitle'), url: window.location.href })
  } catch {
    // Partage annulé par l'utilisateur : rien à faire.
  }
}
</script>

<template>
  <section v-if="data && visible" :aria-label="t('tracking.title')">
    <!-- ── Suivi live : carte plein cadre + ETA + fiche chauffeur ── -->
    <div v-if="live" class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="relative">
        <TrackingMap
          class="h-[46vh] min-h-[300px]"
          :phase="data.phase"
          :driver-position="data.driverPosition"
          :pickup="data.pickup"
          :dropoff="data.dropoff"
          :polyline="data.polyline"
        />

        <!-- Bandeau haut : phase + indicateur temps réel -->
        <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span class="max-w-[70%] truncate rounded-full bg-slate-950/85 px-3.5 py-2 text-xs font-semibold text-white shadow-md">
            {{ phaseLabel }}
          </span>
          <span
            v-if="positionFresh"
            class="flex shrink-0 items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[11px] font-bold text-green-700 shadow-md"
          >
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-600 opacity-60" />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
            </span>
            {{ t('tracking.live') }}
          </span>
          <span
            v-else-if="positionAgeMin != null"
            class="shrink-0 rounded-full bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-500 shadow-md"
          >
            {{ t('tracking.positionAge', { min: positionAgeMin }) }}
          </span>
        </div>

        <!-- Bandeau bas : chauffeur arrivé, ou heure d'arrivée estimée -->
        <div class="absolute inset-x-3 bottom-3">
          <div v-if="data.phase === 'ARRIVED'" class="rounded-2xl bg-green-700/95 px-4 py-3 text-white shadow-lg">
            <p class="font-semibold">🅿️ {{ t('tracking.arrivedTitle') }}</p>
            <p class="mt-0.5 text-sm text-green-100">
              {{ t('tracking.arrivedBody', { name: data.driver.displayName }) }}
            </p>
          </div>
          <div
            v-else-if="etaTime"
            class="flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lg"
          >
            <div class="min-w-0">
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {{ data.phase === 'ON_BOARD' ? t('tracking.etaDropoffLabel') : t('tracking.etaLabel') }}
              </p>
              <p class="font-serif text-3xl leading-tight text-slate-900">{{ etaTime }}</p>
            </div>
            <div v-if="etaMinutes != null" class="shrink-0 rounded-xl bg-brand-50 px-3.5 py-2 text-center">
              <p class="font-grotesk text-2xl font-semibold leading-none text-brand-700">{{ etaMinutes }}</p>
              <p class="mt-0.5 text-[11px] font-semibold text-brand-700/80">min</p>
            </div>
          </div>
          <!-- En route mais pas encore de position partagée : message d'attente. -->
          <div v-else class="rounded-2xl bg-white/95 px-4 py-3 text-sm text-slate-600 shadow-lg">
            🚗 {{ t('tracking.waitingPosition', { name: data.driver.displayName }) }}
          </div>
        </div>
      </div>

      <!-- Fiche chauffeur : photo, véhicule, appel en un geste (≥44 px). -->
      <div class="flex min-h-[64px] items-center gap-3 px-4 py-3">
        <img
          v-if="data.driver.photoUrl"
          :src="data.driver.photoUrl"
          class="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover"
          alt=""
        />
        <div v-else class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg" aria-hidden="true">
          🚘
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-900">{{ data.driver.displayName }}</p>
          <p v-if="data.driver.vehicleLabel" class="truncate text-xs text-slate-500">
            {{ data.driver.vehicleLabel }}<template v-if="data.driver.vehicleColor"> · {{ data.driver.vehicleColor }}</template>
          </p>
        </div>
        <img
          v-if="data.driver.vehicleImage && !vehicleImageBroken"
          :src="data.driver.vehicleImage"
          class="h-10 w-auto max-w-[92px] shrink-0 object-contain"
          alt=""
          @error="vehicleImageBroken = true"
        />
        <a
          v-if="driverPhoneHref"
          :href="driverPhoneHref"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-700"
          :aria-label="t('tracking.call')"
        >📞</a>
      </div>
    </div>

    <!-- ── Avant la course (24 h) : teaser du suivi ── -->
    <div
      v-else-if="phase === 'UPCOMING'"
      class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600"
    >
      <p class="font-semibold text-slate-800">📍 {{ t('tracking.title') }}</p>
      <p class="mt-1">{{ t('tracking.upcomingHint', { name: data.driver.displayName }) }}</p>
    </div>

    <!-- ── Course terminée ── -->
    <div v-else-if="phase === 'COMPLETED'" class="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
      <p class="font-semibold">🎉 {{ t('tracking.completedTitle') }}</p>
      <p class="mt-1">{{ t('tracking.completedBody', { name: data.driver.displayName }) }}</p>
    </div>

    <!-- ── Timeline des étapes ── -->
    <ol v-if="showTimeline" class="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <li v-for="(step, i) in steps" :key="step.key" class="flex gap-3">
        <div class="flex flex-col items-center">
          <span
            class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
            :class="step.done ? 'bg-brand-600' : i === currentStepIndex ? 'bg-brand-100 ring-2 ring-brand-400' : 'bg-slate-200'"
          >
            <span v-if="step.done" class="text-[9px] font-bold leading-none text-white">✓</span>
            <span v-else-if="i === currentStepIndex" class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" />
          </span>
          <span v-if="i < steps.length - 1" class="w-px flex-1" :class="step.done ? 'bg-brand-300' : 'bg-slate-200'" />
        </div>
        <div class="pb-3.5 last:pb-0" :class="{ 'pb-0': i === steps.length - 1 }">
          <p class="text-sm" :class="step.done ? 'font-semibold text-slate-900' : i === currentStepIndex ? 'font-medium text-slate-700' : 'text-slate-400'">
            {{ step.label }}
          </p>
          <p v-if="stepTime(step)" class="text-xs text-slate-400">{{ stepTime(step) }}</p>
        </div>
      </li>
    </ol>

    <!-- Partage du suivi (proche qui attend à destination). -->
    <button v-if="live && canShare" class="btn-ghost mt-3 w-full" @click="share">
      🔗 {{ t('tracking.share') }}
    </button>
  </section>
</template>
