<script setup lang="ts">
// Vue « Agenda » de l'onglet Courses : vue mensuelle + agenda du jour + blocage
// de créneaux. Mobile-first. Mise à jour automatique (toutes les 60 s + au
// retour sur l'onglet). Une course confirmée ouvre la fiche partagée
// BookingDetail (toutes les actions) ; un devis en attente ouvre une fiche
// légère de relance.
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
  paid: boolean
}

interface CalEvent {
  id: string
  // PENDING_QUOTE : devis envoyé, en attente de paiement du client (événement
  // virtuel informatif, ne bloque pas le créneau).
  type: 'BOOKING' | 'PENDING_QUOTE' | 'UNAVAILABILITY' | 'WORKING_BLOCK'
  source: string
  title: string | null
  startAt: string
  endAt: string
  bookingId: string | null
  booking: BookingInfo | null
}

/** Course (confirmée ou en attente de paiement), par opposition aux blocages. */
function isRide(e: CalEvent): boolean {
  return e.type === 'BOOKING' || e.type === 'PENDING_QUOTE'
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
  // L'agenda suit le mois affiché : garder un jour d'un autre mois sous la grille
  // (« Jeudi 16 juillet » sous « Août ») est source de confusion.
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
    selectedKey.value = todayKey
  } else {
    selectedKey.value = dateKey(d)
  }
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
  let pending = 0
  let blocks = 0
  for (const day of gridDays.value) {
    if (!day.inMonth) continue
    for (const e of eventsByDay.value[day.key] ?? []) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      if (e.type === 'BOOKING') bookings++
      else if (e.type === 'PENDING_QUOTE') pending++
      else if (e.type === 'UNAVAILABILITY') blocks++
    }
  }
  return { bookings, pending, blocks }
})

// ─── Ouverture d'un événement ────────────────────────────────────────────────

// Course confirmée → fiche partagée BookingDetail (toutes les actions).
const selectedBookingId = ref<string | null>(null)
// Devis en attente → fiche légère de relance (pas encore de réservation).
const openedQuote = ref<CalEvent | null>(null)

function openEvent(e: CalEvent) {
  if (e.type === 'BOOKING' && e.bookingId) selectedBookingId.value = e.bookingId
  else if (e.type === 'PENDING_QUOTE') openedQuote.value = e
}

// Relance d'un devis en attente : renvoie l'email avec le lien de paiement au
// client, directement depuis la fiche (l'id du « booking » d'un PENDING_QUOTE
// est l'id du devis).
const { success: toastSuccess, error: toastError } = useToast()
const resending = ref(false)
async function resendQuote(quoteId: string) {
  resending.value = true
  try {
    await $fetch(`/api/dashboard/quotes/${quoteId}/resend`, { method: 'POST', body: {} })
    toastSuccess('Email envoyé au client.')
    openedQuote.value = null
    await refresh()
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    resending.value = false
  }
}

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
  // Avertir si le blocage chevauche une course confirmée ou un devis en attente
  // de paiement (le client pourrait payer et confirmer ce créneau).
  const conflict = events.value.find(
    (e) =>
      isRide(e) &&
      new Date(e.startAt) < dates.endAt &&
      new Date(e.endAt) > dates.startAt,
  )
  if (conflict) {
    const name = conflict.booking?.customerName ?? 'une course'
    const msg =
      conflict.type === 'PENDING_QUOTE'
        ? `⚠️ Ce créneau chevauche le devis en attente de ${name} (le client peut encore payer). Bloquer quand même ?`
        : `⚠️ Ce créneau chevauche la course de ${name}. Bloquer quand même ?`
    if (!confirm(msg)) return
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
  <div>
    <!-- minmax(0,1fr) : sans lui, la piste de grille s'élargit au min-content de la
         carte agenda (adresses) et TOUTE la page déborde horizontalement sur mobile. -->
    <div class="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr),360px] lg:items-start">
      <!-- ════ Vue mensuelle ════ -->
      <div class="card min-w-0 !p-3 sm:!p-5">
        <!-- Navigation mois -->
        <div class="flex items-center justify-between">
          <button
            class="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
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
              class="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              @click="goToday"
            >
              Aujourd'hui
            </button>
          </div>
          <button
            class="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
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
                    : e.type === 'PENDING_QUOTE'
                      ? day.key === selectedKey ? 'bg-white/60 ring-1 ring-white' : 'bg-white ring-1 ring-brand-400'
                      : day.key === selectedKey ? 'bg-white/70' : 'bg-slate-400',
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
                    : e.type === 'PENDING_QUOTE'
                      ? day.key === selectedKey ? 'bg-white/10 text-white ring-1 ring-white/40' : 'bg-white text-brand-600 ring-1 ring-brand-200'
                      : day.key === selectedKey ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                ]"
              >
                <template v-if="e.type === 'BOOKING'">🚗 {{ e.booking?.customerName ?? 'Course' }}</template>
                <template v-else-if="e.type === 'PENDING_QUOTE'">⏳ {{ e.booking?.customerName ?? 'Devis' }}</template>
                <template v-else>{{ e.title ?? 'Indispo' }}</template>
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
              <span class="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-brand-400" /> Attente paiement
            </span>
            <span class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-slate-400" /> Indisponible
            </span>
          </span>
          <span>
            {{ monthStats.bookings }} course(s)<template v-if="monthStats.pending"> · {{ monthStats.pending }} en attente</template> · {{ monthStats.blocks }} blocage(s)
            <span v-if="pending" class="ml-1 text-slate-300">⟳</span>
          </span>
        </div>
      </div>

      <!-- ════ Agenda du jour sélectionné ════ -->
      <div class="card min-w-0 !p-4 sm:!p-5">
        <div class="flex items-center justify-between gap-2">
          <h2 class="min-w-0 font-bold capitalize text-slate-900">{{ fmtLongDate(selectedKey) }}</h2>
          <button class="btn-ghost shrink-0 whitespace-nowrap !px-3 !py-2 text-xs" @click="openBlock">+ Bloquer</button>
        </div>

        <p v-if="!dayEvents.length" class="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          Journée libre 🎉
        </p>

        <div class="mt-3 space-y-2">
          <component
            :is="isRide(e) ? 'button' : 'div'"
            v-for="e in dayEvents"
            :key="e.id"
            class="flex w-full items-start gap-3 rounded-xl border p-3 text-left"
            :class="
              e.type === 'BOOKING'
                ? 'border-brand-100 bg-brand-50/60 transition hover:border-brand-300'
                : e.type === 'PENDING_QUOTE'
                  ? 'border-dashed border-brand-300 bg-white transition hover:border-brand-400'
                  : 'border-slate-200 bg-slate-50'
            "
            @click="isRide(e) ? openEvent(e) : undefined"
          >
            <span
              class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              :class="
                e.type === 'BOOKING'
                  ? 'bg-brand-600'
                  : e.type === 'PENDING_QUOTE'
                    ? 'bg-white ring-1 ring-brand-400'
                    : 'bg-slate-400'
              "
            />
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold text-slate-500">{{ eventTimeLabel(e) }}</span>
              <span class="block truncate text-sm font-semibold text-slate-900">
                <template v-if="isRide(e)">
                  {{ e.booking?.customerName ?? 'Course' }}
                  <span class="font-normal text-slate-500">
                    · {{ e.booking?.type === 'TRANSFER' ? 'Transfert' : 'Mise à dispo' }}
                  </span>
                </template>
                <template v-else>{{ e.title ?? 'Indisponible' }}</template>
              </span>
              <span
                v-if="e.type === 'BOOKING'"
                class="mt-0.5 inline-block rounded-full bg-brand-100 px-2 py-px text-[11px] font-semibold text-brand-800"
              >
                🚗 Course confirmée
              </span>
              <span
                v-else-if="e.type === 'PENDING_QUOTE'"
                class="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-px text-[11px] font-semibold text-amber-800"
              >
                ⏳ En attente de paiement
              </span>
              <RideRoute
                v-if="isRide(e) && e.booking?.pickupAddress"
                class="mt-0.5 text-xs text-slate-500"
                :pickup="e.booking.pickupAddress"
                :dropoff="e.booking.dropoffAddress"
              />
            </span>
            <span v-if="isRide(e)" class="shrink-0 text-sm font-bold text-slate-900">
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

    <!-- ════ Fiche course partagée (course confirmée) ════ -->
    <BookingDetail
      v-if="selectedBookingId"
      :booking-id="selectedBookingId"
      @close="selectedBookingId = null"
      @changed="refresh()"
    />

    <!-- ════ Fiche devis en attente (relance) ════ -->
    <div
      v-if="openedQuote"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
      @click.self="openedQuote = null"
    >
      <!-- Bottom sheet : hauteur bornée + scroll interne + safe-area sous les actions. -->
      <div class="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">
              {{ openedQuote.booking?.type === 'TRANSFER' ? 'Transfert' : 'Mise à disposition' }}
              <span v-if="openedQuote.booking?.roundTrip"> · Aller-retour</span>
            </p>
            <h3 class="mt-1 text-lg font-bold text-slate-900">
              {{ openedQuote.booking?.customerName }}
            </h3>
            <span class="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              ⏳ Devis en attente de paiement
            </span>
          </div>
          <button
            class="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            aria-label="Fermer"
            @click="openedQuote = null"
          >
            ✕
          </button>
        </div>

        <div class="mt-3 space-y-2 text-sm text-slate-600">
          <p>🕐 {{ eventTimeLabel(openedQuote) }} <span class="text-xs text-slate-400">(approche incluse)</span></p>
          <RideRoute
            v-if="openedQuote.booking?.pickupAddress"
            nav
            wrap
            :pickup="openedQuote.booking.pickupAddress"
            :dropoff="openedQuote.booking.dropoffAddress"
          />
          <p v-if="openedQuote.booking?.type === 'HOURLY'">
            ⏱️ {{ openedQuote.booking.durationHours }} h de mise à disposition
          </p>
          <p v-if="openedQuote.booking?.notes" class="italic text-slate-400">
            « {{ openedQuote.booking.notes }} »
          </p>
          <p class="text-base font-bold text-slate-900">
            {{ formatMoney(openedQuote.booking?.amountCents ?? 0) }}
            <span class="text-xs font-normal text-amber-600">en attente de paiement du client</span>
          </p>
          <p class="text-xs text-slate-500">
            Le lien de paiement a été envoyé au client. La course sera confirmée dès son
            règlement (ou sa réservation).
          </p>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2">
          <a
            :href="`tel:${(openedQuote.booking?.customerPhone ?? '').replace(/[^+\d]/g, '')}`"
            class="btn-ghost !px-2 !py-2.5 text-center text-sm"
          >
            📞 Appeler
          </a>
          <a
            :href="`sms:${(openedQuote.booking?.customerPhone ?? '').replace(/[^+\d]/g, '')}`"
            class="btn-ghost !px-2 !py-2.5 text-center text-sm"
          >
            💬 SMS
          </a>
          <!-- Relance directe du client (renvoi du lien de paiement) -->
          <button
            type="button"
            class="btn-ghost !px-2 !py-2.5 text-sm"
            :disabled="resending"
            @click="resendQuote(openedQuote.booking!.id)"
          >
            {{ resending ? '…' : '↩ Relancer' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ════ Modale de blocage de créneau ════ -->
    <div
      v-if="showBlock"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
      @click.self="showBlock = false"
    >
      <div class="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-slate-900">Bloquer un créneau</h3>
          <button
            class="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            aria-label="Fermer"
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
            class="rounded-full border px-3.5 py-2.5 text-xs font-semibold transition"
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

          <!-- min-w-0 : les champs date iOS ne débordent pas de leur colonne. -->
          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label class="label" for="block-start-date">Du</label>
              <input id="block-start-date" v-model="block.startDate" type="date" class="field" />
            </div>
            <div class="min-w-0">
              <label class="label" for="block-end-date">Au (inclus)</label>
              <input id="block-end-date" v-model="block.endDate" type="date" class="field" :min="block.startDate" />
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input v-model="block.allDay" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
            Journée(s) entière(s)
          </label>

          <div v-if="!block.allDay" class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label class="label" for="block-start-time">De</label>
              <input id="block-start-time" v-model="block.startTime" type="time" class="field" />
            </div>
            <div class="min-w-0">
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
