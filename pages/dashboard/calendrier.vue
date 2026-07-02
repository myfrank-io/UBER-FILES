<script setup lang="ts">
// Calendrier du chauffeur : vue mensuelle + agenda du jour + blocage de créneaux.
// Mobile-first. Mise à jour automatique (toutes les 60 s + au retour sur l'onglet).
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Calendrier' })
const { formatMoney } = useFormat()

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingInfo {
  id: string
  status: string
  amountCents: number
  scheduledAt: string
  customerName: string
  customerPhone: string
  type: 'TRANSFER' | 'HOURLY'
  pickupAddress: string | null
  dropoffAddress: string | null
  roundTrip: boolean
  durationHours: number | null
  notes: string | null
}

interface CalEvent {
  id: string
  type: 'BOOKING' | 'UNAVAILABILITY' | 'WORKING_BLOCK'
  source: string
  title: string | null
  startAt: string
  endAt: string
  bookingId: string | null
  booking: BookingInfo | null
}

// ─── Date helpers (local, sans dépendance) ──────────────────────────────────

const DAY_MS = 86_400_000
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function fmtLongDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

// ─── État de la vue ──────────────────────────────────────────────────────────

const today = new Date()
const todayKey = dateKey(today)
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth()) // 0..11
const selectedKey = ref(todayKey)

// Grille fixe de 6 semaines (42 jours), semaine commençant le lundi.
const gridStart = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const offset = (first.getDay() + 6) % 7 // 0 = lundi
  return new Date(first.getTime() - offset * DAY_MS)
})
const gridDays = computed(() =>
  Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart.value.getTime() + i * DAY_MS)
    return { key: dateKey(d), dayNum: d.getDate(), inMonth: d.getMonth() === viewMonth.value }
  }),
)

function goMonth(delta: number) {
  const d = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}
function goToday() {
  viewYear.value = today.getFullYear()
  viewMonth.value = today.getMonth()
  selectedKey.value = todayKey
}

// ─── Chargement des événements (plage = grille affichée) ────────────────────

const range = computed(() => ({
  from: new Date(gridStart.value.getTime()).toISOString(),
  to: new Date(gridStart.value.getTime() + 42 * DAY_MS).toISOString(),
}))

const { data: events, refresh, pending } = await useFetch<CalEvent[]>('/api/dashboard/calendar', {
  lazy: true,
  query: range,
  watch: [range],
  default: () => [],
})

// Mise à jour automatique : toutes les 60 s + quand on revient sur l'onglet.
let pollTimer: ReturnType<typeof setInterval> | null = null
function onVisible() {
  if (document.visibilityState === 'visible') refresh()
}
onMounted(() => {
  pollTimer = setInterval(() => refresh(), 60_000)
  document.addEventListener('visibilitychange', onVisible)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', onVisible)
})

// ─── Indexation par jour (gère les événements multi-jours) ──────────────────

const eventsByDay = computed(() => {
  const map: Record<string, CalEvent[]> = {}
  for (const e of events.value) {
    const start = startOfDay(new Date(e.startAt))
    const lastDay = startOfDay(new Date(new Date(e.endAt).getTime() - 1))
    for (let t = start.getTime(); t <= lastDay.getTime(); t += DAY_MS) {
      const key = dateKey(new Date(t))
      ;(map[key] ??= []).push(e)
    }
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }
  return map
})

const dayEvents = computed(() => eventsByDay.value[selectedKey.value] ?? [])

const monthStats = computed(() => {
  const seen = new Set<string>()
  let bookings = 0
  let blocks = 0
  for (const day of gridDays.value) {
    if (!day.inMonth) continue
    for (const e of eventsByDay.value[day.key] ?? []) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      if (e.type === 'BOOKING') bookings++
      else if (e.type === 'UNAVAILABILITY') blocks++
    }
  }
  return { bookings, blocks }
})

// ─── Détail d'une course (fiche) ─────────────────────────────────────────────

const openedBooking = ref<CalEvent | null>(null)

// ─── Blocage de créneau ──────────────────────────────────────────────────────

const showBlock = ref(false)
const blockBusy = ref(false)
const blockError = ref('')
const block = reactive({
  title: '',
  startDate: todayKey,
  endDate: todayKey,
  startTime: '09:00',
  endTime: '18:00',
  allDay: false,
})

const PRESETS = [
  { label: 'Journée entière', allDay: true },
  { label: 'Matin', start: '06:00', end: '12:00' },
  { label: 'Après-midi', start: '12:00', end: '18:00' },
  { label: 'Soirée', start: '18:00', end: '23:59' },
]

function openBlock() {
  block.title = ''
  block.startDate = selectedKey.value
  block.endDate = selectedKey.value
  block.startTime = '09:00'
  block.endTime = '18:00'
  block.allDay = false
  blockError.value = ''
  showBlock.value = true
}
function applyPreset(p: (typeof PRESETS)[number]) {
  if (p.allDay) {
    block.allDay = true
  } else {
    block.allDay = false
    block.startTime = p.start!
    block.endTime = p.end!
  }
}

function blockDates(): { startAt: Date; endAt: Date } | null {
  const [sy, sm, sd] = block.startDate.split('-').map(Number)
  const [ey, em, ed] = block.endDate.split('-').map(Number)
  if (!sy || !ey) return null
  let startAt: Date
  let endAt: Date
  if (block.allDay) {
    startAt = new Date(sy, sm - 1, sd, 0, 0)
    endAt = new Date(ey, em - 1, ed + 1, 0, 0) // fin de journée incluse
  } else {
    const [sh, smin] = block.startTime.split(':').map(Number)
    const [eh, emin] = block.endTime.split(':').map(Number)
    startAt = new Date(sy, sm - 1, sd, sh, smin)
    endAt = new Date(ey, em - 1, ed, eh, emin)
  }
  return { startAt, endAt }
}

async function saveBlock() {
  blockError.value = ''
  const dates = blockDates()
  if (!dates) {
    blockError.value = 'Dates invalides.'
    return
  }
  if (dates.endAt <= dates.startAt) {
    blockError.value = 'La fin doit être après le début.'
    return
  }
  // Avertir si le blocage chevauche une course confirmée.
  const conflict = events.value.find(
    (e) =>
      e.type === 'BOOKING' &&
      new Date(e.startAt) < dates.endAt &&
      new Date(e.endAt) > dates.startAt,
  )
  if (conflict) {
    const name = conflict.booking?.customerName ?? 'une course'
    if (!confirm(`⚠️ Ce créneau chevauche la course de ${name}. Bloquer quand même ?`)) return
  }

  blockBusy.value = true
  try {
    await $fetch('/api/dashboard/availability', {
      method: 'POST',
      body: {
        title: block.title || undefined,
        startAt: dates.startAt.toISOString(),
        endAt: dates.endAt.toISOString(),
      },
    })
    showBlock.value = false
    selectedKey.value = block.startDate
    await refresh()
  } catch (e) {
    blockError.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    blockBusy.value = false
  }
}

const deleteBusy = ref<string | null>(null)
async function removeBlock(id: string) {
  if (!confirm('Supprimer cette indisponibilité ?')) return
  deleteBusy.value = id
  try {
    await $fetch(`/api/dashboard/availability/${id}`, { method: 'DELETE' })
    await refresh()
  } finally {
    deleteBusy.value = null
  }
}

// ─── Affichage d'un événement dans l'agenda ─────────────────────────────────

function eventTimeLabel(e: CalEvent): string {
  const sameDay = dateKey(new Date(e.startAt)) === dateKey(new Date(e.endAt))
  if (sameDay) return `${fmtTime(e.startAt)} – ${fmtTime(e.endAt)}`
  return `${fmtShortDate(e.startAt)} ${fmtTime(e.startAt)} → ${fmtShortDate(e.endAt)} ${fmtTime(e.endAt)}`
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <!-- En-tête -->
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-slate-900">Calendrier</h1>
      <button class="btn-primary !px-4 !py-2 text-sm" @click="openBlock">+ Bloquer</button>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[1fr,360px] lg:items-start">
      <!-- ════ Vue mensuelle ════ -->
      <div class="card !p-3 sm:!p-5">
        <!-- Navigation mois -->
        <div class="flex items-center justify-between">
          <button
            class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="Mois précédent"
            @click="goMonth(-1)"
          >
            ←
          </button>
          <div class="flex items-center gap-2">
            <p class="text-base font-bold capitalize text-slate-900">
              {{ MONTHS[viewMonth] }} {{ viewYear }}
            </p>
            <button
              v-if="viewMonth !== today.getMonth() || viewYear !== today.getFullYear() || selectedKey !== todayKey"
              class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              @click="goToday"
            >
              Aujourd'hui
            </button>
          </div>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="Mois suivant"
            @click="goMonth(1)"
          >
            →
          </button>
        </div>

        <!-- Jours de la semaine -->
        <div class="mt-3 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span>
        </div>

        <!-- Grille -->
        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="day in gridDays"
            :key="day.key"
            class="relative flex aspect-square flex-col items-center justify-start rounded-xl pt-1.5 transition sm:aspect-auto sm:min-h-[72px] sm:items-start sm:px-2"
            :class="[
              day.key === selectedKey
                ? 'bg-brand-600 text-white shadow'
                : day.inMonth
                  ? 'text-slate-800 hover:bg-slate-100'
                  : 'text-slate-300 hover:bg-slate-50',
            ]"
            @click="selectedKey = day.key"
          >
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium"
              :class="day.key === todayKey && day.key !== selectedKey ? 'bg-brand-100 font-bold text-brand-700' : ''"
            >
              {{ day.dayNum }}
            </span>

            <!-- Pastilles (mobile) -->
            <span class="mt-0.5 flex gap-0.5 sm:hidden">
              <span
                v-for="e in (eventsByDay[day.key] ?? []).slice(0, 3)"
                :key="e.id"
                class="h-1.5 w-1.5 rounded-full"
                :class="[
                  e.type === 'BOOKING'
                    ? day.key === selectedKey ? 'bg-white' : 'bg-brand-600'
                    : day.key === selectedKey ? 'bg-amber-200' : 'bg-amber-400',
                ]"
              />
            </span>

            <!-- Mini-étiquettes (desktop) -->
            <span class="mt-1 hidden w-full space-y-0.5 sm:block">
              <span
                v-for="e in (eventsByDay[day.key] ?? []).slice(0, 2)"
                :key="e.id"
                class="block truncate rounded px-1 py-px text-left text-[10px] font-medium leading-tight"
                :class="[
                  e.type === 'BOOKING'
                    ? day.key === selectedKey ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'
                    : day.key === selectedKey ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700',
                ]"
              >
                {{ e.type === 'BOOKING' ? (e.booking?.customerName ?? 'Course') : (e.title ?? 'Indispo') }}
              </span>
              <span
                v-if="(eventsByDay[day.key] ?? []).length > 2"
                class="block px-1 text-left text-[10px]"
                :class="day.key === selectedKey ? 'text-white/80' : 'text-slate-400'"
              >
                +{{ (eventsByDay[day.key] ?? []).length - 2 }} autre(s)
              </span>
            </span>
          </button>
        </div>

        <!-- Légende + stats du mois -->
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span class="flex items-center gap-3">
            <span class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-brand-600" /> Course
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-amber-400" /> Indisponible
            </span>
          </span>
          <span>
            {{ monthStats.bookings }} course(s) · {{ monthStats.blocks }} blocage(s)
            <span v-if="pending" class="ml-1 text-slate-300">⟳</span>
          </span>
        </div>
      </div>

      <!-- ════ Agenda du jour sélectionné ════ -->
      <div class="card !p-4 sm:!p-5">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-bold capitalize text-slate-900">{{ fmtLongDate(selectedKey) }}</h2>
          <button class="btn-ghost !px-3 !py-1.5 text-xs" @click="openBlock">Bloquer ce jour</button>
        </div>

        <p v-if="!dayEvents.length" class="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          Journée libre 🎉
        </p>

        <div class="mt-3 space-y-2">
          <component
            :is="e.type === 'BOOKING' ? 'button' : 'div'"
            v-for="e in dayEvents"
            :key="e.id"
            class="flex w-full items-start gap-3 rounded-xl border p-3 text-left"
            :class="
              e.type === 'BOOKING'
                ? 'border-brand-100 bg-brand-50/60 transition hover:border-brand-300'
                : 'border-amber-100 bg-amber-50/60'
            "
            @click="e.type === 'BOOKING' ? (openedBooking = e) : undefined"
          >
            <span
              class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              :class="e.type === 'BOOKING' ? 'bg-brand-600' : 'bg-amber-400'"
            />
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold text-slate-500">{{ eventTimeLabel(e) }}</span>
              <span class="block truncate text-sm font-semibold text-slate-900">
                <template v-if="e.type === 'BOOKING'">
                  {{ e.booking?.customerName ?? 'Course' }}
                  <span class="font-normal text-slate-500">
                    · {{ e.booking?.type === 'TRANSFER' ? 'Transfert' : 'Mise à dispo' }}
                  </span>
                </template>
                <template v-else>{{ e.title ?? 'Indisponible' }}</template>
              </span>
              <span
                v-if="e.type === 'BOOKING' && e.booking?.pickupAddress"
                class="block truncate text-xs text-slate-500"
              >
                {{ e.booking.pickupAddress }} → {{ e.booking.dropoffAddress }}
              </span>
            </span>
            <span v-if="e.type === 'BOOKING'" class="shrink-0 text-sm font-bold text-slate-900">
              {{ formatMoney(e.booking?.amountCents ?? 0) }}
            </span>
            <button
              v-else
              class="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
              :disabled="deleteBusy === e.id"
              @click.stop="removeBlock(e.id)"
            >
              {{ deleteBusy === e.id ? '…' : 'Suppr.' }}
            </button>
          </component>
        </div>
      </div>
    </div>

    <!-- ════ Fiche course (modale) ════ -->
    <div
      v-if="openedBooking"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
      @click.self="openedBooking = null"
    >
      <div class="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">
              {{ openedBooking.booking?.type === 'TRANSFER' ? 'Transfert' : 'Mise à disposition' }}
              <span v-if="openedBooking.booking?.roundTrip"> · Aller-retour</span>
            </p>
            <h3 class="mt-1 text-lg font-bold text-slate-900">
              {{ openedBooking.booking?.customerName }}
            </h3>
          </div>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            @click="openedBooking = null"
          >
            ✕
          </button>
        </div>

        <div class="mt-3 space-y-2 text-sm text-slate-600">
          <p>🕐 {{ eventTimeLabel(openedBooking) }} <span class="text-xs text-slate-400">(approche incluse)</span></p>
          <p v-if="openedBooking.booking?.pickupAddress">
            📍 {{ openedBooking.booking.pickupAddress }} → {{ openedBooking.booking.dropoffAddress }}
          </p>
          <p v-if="openedBooking.booking?.type === 'HOURLY'">
            ⏱️ {{ openedBooking.booking.durationHours }} h de mise à disposition
          </p>
          <p v-if="openedBooking.booking?.notes" class="italic text-slate-400">
            « {{ openedBooking.booking.notes }} »
          </p>
          <p class="text-base font-bold text-slate-900">
            {{ formatMoney(openedBooking.booking?.amountCents ?? 0) }}
            <span class="text-xs font-normal text-green-600">payé ✓</span>
          </p>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <a :href="`tel:${openedBooking.booking?.customerPhone}`" class="btn-primary !py-2.5 text-sm">
            📞 Appeler
          </a>
          <NuxtLink to="/dashboard/reservations" class="btn-ghost !py-2.5 text-sm" @click="openedBooking = null">
            Voir la réservation
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- ════ Modale de blocage de créneau ════ -->
    <div
      v-if="showBlock"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
      @click.self="showBlock = false"
    >
      <div class="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-slate-900">Bloquer un créneau</h3>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            @click="showBlock = false"
          >
            ✕
          </button>
        </div>

        <!-- Raccourcis -->
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="p in PRESETS"
            :key="p.label"
            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
            :class="
              (p.allDay && block.allDay) || (!p.allDay && !block.allDay && block.startTime === p.start && block.endTime === p.end)
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            "
            @click="applyPreset(p)"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="label" for="block-title">Motif (optionnel)</label>
            <input
              id="block-title"
              v-model="block.title"
              type="text"
              class="field"
              placeholder="Ex : Congés, RDV perso, pause…"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="block-start-date">Du</label>
              <input id="block-start-date" v-model="block.startDate" type="date" class="field" />
            </div>
            <div>
              <label class="label" for="block-end-date">Au (inclus)</label>
              <input id="block-end-date" v-model="block.endDate" type="date" class="field" :min="block.startDate" />
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input v-model="block.allDay" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
            Journée(s) entière(s)
          </label>

          <div v-if="!block.allDay" class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="block-start-time">De</label>
              <input id="block-start-time" v-model="block.startTime" type="time" class="field" />
            </div>
            <div>
              <label class="label" for="block-end-time">À</label>
              <input id="block-end-time" v-model="block.endTime" type="time" class="field" />
            </div>
          </div>
        </div>

        <p v-if="blockError" class="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {{ blockError }}
        </p>

        <button class="btn-primary mt-4 w-full" :disabled="blockBusy" @click="saveBlock">
          {{ blockBusy ? 'Enregistrement…' : 'Bloquer ce créneau' }}
        </button>
      </div>
    </div>
  </div>
</template>
