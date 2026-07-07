<script setup lang="ts">
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'

definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Réservations' })
const { formatMoney, formatDateTime } = useFormat()
const { error: toastError, success: toastSuccess } = useToast()

function methodLabel(method: unknown): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? ''
}

// Version courte (« Espèces », « Carte ») pour les phrases qui disent déjà « sur place ».
function shortMethodLabel(method: unknown): string {
  return PAYMENT_METHOD_SHORT_LABELS[method as PaymentMethod] ?? ''
}

// ─── Filtres ──────────────────────────────────────────────────────────────────

const filterStatus = ref('')
const filterFrom = ref('')
const filterTo = ref('')
const page = ref(1)

const query = computed(() => ({
  ...(filterStatus.value ? { status: filterStatus.value } : {}),
  ...(filterFrom.value ? { from: filterFrom.value } : {}),
  ...(filterTo.value ? { to: filterTo.value } : {}),
  page: page.value,
}))

const { data, refresh, pending } = await useFetch('/api/dashboard/bookings', { query, lazy: true })

function applyFilters() { page.value = 1; refresh() }
function resetFilters() {
  filterStatus.value = ''
  filterFrom.value = ''
  filterTo.value = ''
  page.value = 1
  refresh()
}

// ─── Actions ─────────────────────────────────────────────────────────────────

const selected = ref<string | null>(null)
const detail = ref<Record<string, unknown> | null>(null)
const loadingDetail = ref(false)
const completing = ref<string | null>(null)

async function openDetail(id: string) {
  selected.value = id
  loadingDetail.value = true
  detail.value = null
  try {
    detail.value = await $fetch(`/api/dashboard/bookings/${id}`)
  } finally {
    loadingDetail.value = false
  }
}

function closeDetail() { selected.value = null; detail.value = null }

// Paiement le plus parlant pour la pastille du détail : un règlement effectué
// (PAID) prime sur un encaissement attendu (PENDING), sinon le dernier connu.
const detailPayment = computed(() => {
  const payments = (detail.value?.payments as { method?: string; status?: string }[] | undefined) ?? []
  return (
    payments.find((p) => p.status === 'PAID') ??
    payments.find((p) => p.status === 'PENDING') ??
    payments[payments.length - 1] ??
    null
  )
})

async function markComplete(id: string) {
  if (!confirm('Marquer cette course comme terminée ?')) return
  completing.value = id
  try {
    await $fetch(`/api/dashboard/bookings/${id}/complete`, { method: 'POST' })
    await refresh()
    if (selected.value === id) await openDetail(id)
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    completing.value = null
  }
}

const markingPaid = ref<string | null>(null)

// Conditions des actions rapides d'une carte (partagées entre le conteneur et
// chaque bouton, pour éviter de dupliquer la logique dans le template).
interface BookingRow {
  status: string
  scheduledAt: string
  payment?: { status?: string } | null
}
function canMarkPaid(b: BookingRow): boolean {
  return Boolean(b.payment && b.payment.status === 'PENDING' && b.status !== 'CANCELLED')
}
function canComplete(b: BookingRow): boolean {
  return b.status === 'CONFIRMED' && new Date(b.scheduledAt) <= new Date()
}

async function markPaid(id: string) {
  if (!confirm('Confirmer l’encaissement de cette course ?')) return
  markingPaid.value = id
  try {
    await $fetch(`/api/dashboard/bookings/${id}/mark-paid`, { method: 'POST' })
    toastSuccess('Encaissement enregistré.')
    await refresh()
    if (selected.value === id) await openDetail(id)
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    markingPaid.value = null
  }
}

const cancelling = ref<string | null>(null)

// Le chauffeur peut annuler une course à venir (non terminée, non déjà annulée).
function canCancel(b: BookingRow): boolean {
  return (
    (b.status === 'CONFIRMED' || b.status === 'PENDING_PAYMENT') &&
    new Date(b.scheduledAt) > new Date()
  )
}

async function cancelBooking(id: string) {
  if (!confirm('Annuler cette course ? Le client sera prévenu et intégralement remboursé s’il a payé en ligne.')) return
  cancelling.value = id
  try {
    await $fetch(`/api/dashboard/bookings/${id}/cancel`, { method: 'POST' })
    toastSuccess('Course annulée, client prévenu.')
    await refresh()
    if (selected.value === id) await openDetail(id)
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    cancelling.value = null
  }
}
</script>

<template>
  <div>
    <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Réservations</h1>

    <!-- Filtres : grille propre sur mobile (statut pleine largeur, dates côte à côte,
         rangée d'actions dédiée), rangée libre sur desktop. -->
    <div class="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <div class="col-span-2 sm:col-span-1">
        <label class="label">Statut</label>
        <select v-model="filterStatus" class="field !py-2.5">
          <option value="">Tous</option>
          <option value="CONFIRMED">Confirmées</option>
          <option value="COMPLETED">Terminées</option>
          <option value="CANCELLED">Annulées</option>
        </select>
      </div>
      <div>
        <label class="label">Du</label>
        <input v-model="filterFrom" type="date" class="field !py-2.5" />
      </div>
      <div>
        <label class="label">Au</label>
        <input v-model="filterTo" type="date" class="field !py-2.5" />
      </div>
      <button class="btn-primary !py-2.5 text-sm" @click="applyFilters">Filtrer</button>
      <button class="btn-ghost !py-2.5 text-sm" @click="resetFilters">Réinitialiser</button>
    </div>

    <!-- Compteur -->
    <p v-if="data" class="mt-4 text-sm text-slate-500">
      {{ data.total }} réservation{{ data.total > 1 ? 's' : '' }}
    </p>

    <p v-if="pending" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <div v-if="data && !data.bookings.length && !pending" class="mt-6 text-sm text-slate-500">
      Aucune réservation pour ces critères.
    </div>

    <div class="mt-4 space-y-3">
      <div
        v-for="b in data?.bookings"
        :key="b.id"
        class="card cursor-pointer transition-colors hover:border-brand-200"
        @click="openDetail(b.id)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p class="font-semibold text-slate-900">{{ b.customer.name }}</p>
              <StatusBadge :status="b.status" />
            </div>
            <p class="mt-1 text-sm text-slate-600">{{ formatDateTime(b.scheduledAt) }}</p>
            <!-- Adresses en texte simple sur la carte (le tap ouvre le détail, où les
                 liens de navigation GPS restent disponibles). -->
            <div v-if="b.ride.type === 'TRANSFER'" class="mt-0.5 text-xs text-slate-500">
              <RideRoute :pickup="b.ride.pickupAddress" :dropoff="b.ride.dropoffAddress" />
              <span v-if="b.ride.roundTrip" class="text-slate-400">Aller-retour</span>
            </div>
            <p v-else class="mt-0.5 truncate text-xs text-slate-500">
              Mise à disposition — {{ b.ride.durationHours }}h
            </p>
            <!-- Règlement de la course, en un coup d'œil (payé en ligne / sur place / à encaisser) -->
            <PaymentBadge
              v-if="b.payment"
              class="mt-1.5"
              :method="b.payment.method"
              :status="b.payment.status"
              :booking-status="b.status"
            />
          </div>
          <p class="shrink-0 font-bold text-slate-900">{{ formatMoney(b.amountCents, b.currency) }}</p>
        </div>

        <!-- Actions rapides regroupées sous un seul séparateur, hauteurs unifiées.
             Encaissement sur place (jamais sur une course annulée) + clôture de course. -->
        <div
          v-if="canMarkPaid(b) || canComplete(b)"
          class="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3"
          @click.stop
        >
          <button
            v-if="canMarkPaid(b)"
            class="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-green-600 bg-white px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
            :disabled="markingPaid === b.id"
            @click="markPaid(b.id)"
          >
            {{ markingPaid === b.id ? '…' : 'Marquer comme encaissé' }}
          </button>
          <button
            v-if="canComplete(b)"
            class="btn-primary flex-1 !py-2 text-xs"
            :disabled="completing === b.id"
            @click="markComplete(b.id)"
          >
            {{ completing === b.id ? '…' : 'Marquer comme terminée' }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-6">
      <AppPagination v-if="data" :page="page" :pages="data.pages" @change="(p) => { page = p; refresh() }" />
    </div>
  </div>

  <!-- Panneau de détail -->
  <Teleport to="body">
    <div v-if="selected" class="fixed inset-0 z-40 flex justify-end bg-slate-900/30" @click.self="closeDetail">
      <div class="relative w-full max-w-md overflow-y-auto bg-white shadow-2xl">
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white py-2 pl-5 pr-2">
          <h2 class="font-semibold text-slate-900">Détail de la réservation</h2>
          <button
            class="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
            @click="closeDetail"
          >
            ✕
          </button>
        </div>

        <div v-if="loadingDetail" class="p-5 text-sm text-slate-400">Chargement…</div>

        <div v-else-if="detail" class="space-y-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge :status="(detail.status as string)" />
            <PaymentBadge
              v-if="detailPayment"
              :method="detailPayment.method"
              :status="detailPayment.status"
              :booking-status="(detail.status as string)"
            />
            <span class="text-sm text-slate-500">{{ formatDateTime(detail.scheduledAt as string) }}</span>
          </div>

          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Client</p>
            <p class="mt-2 font-semibold text-slate-900">{{ (detail.customer as Record<string, string>).name }}</p>
            <ContactActions
              class="mt-2"
              :phone="(detail.customer as Record<string, string>).phone"
              :email="(detail.customer as Record<string, string>).email"
            />
            <p class="mt-1.5 text-xs text-slate-400">{{ (detail.customer as Record<string, string>).email }}</p>
          </div>

          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Trajet</p>
            <template v-if="(detail.ride as Record<string, unknown>).type === 'TRANSFER'">
              <RideRoute
                nav
                wrap
                class="mt-2 text-sm text-slate-700"
                :pickup="(detail.ride as Record<string, string>).pickupAddress"
                :dropoff="(detail.ride as Record<string, string>).dropoffAddress"
              />
              <p v-if="(detail.ride as Record<string, unknown>).roundTrip" class="mt-1 text-xs text-slate-500">Aller-retour</p>
              <p v-if="(detail.ride as Record<string, unknown>).distanceMeters" class="mt-1 text-xs text-slate-500">
                {{ Math.round(((detail.ride as Record<string, number>).distanceMeters) / 1000) }} km
              </p>
            </template>
            <template v-else>
              <p class="mt-2 text-sm text-slate-700">Mise à disposition — {{ (detail.ride as Record<string, number>).durationHours }}h</p>
              <p v-if="(detail.ride as Record<string, string>).pickupAddress" class="text-sm text-slate-700">
                <span class="font-medium">Prise en charge :</span>
                <NavAddress :address="(detail.ride as Record<string, string>).pickupAddress" />
              </p>
            </template>
            <p v-if="(detail.ride as Record<string, string>).terminalLabel" class="mt-2 text-sm text-slate-700">
              🚪 <span class="font-medium">{{ (detail.ride as Record<string, string>).terminalLabel }}</span>
              <span class="text-xs text-slate-400"> (indiqué par le client)</span>
            </p>
            <!-- Lancement navigation à la demande (juste avant la course). -->
            <div v-if="(detail.ride as Record<string, string>).wazeUrl" class="mt-3 flex gap-2">
              <a
                :href="(detail.ride as Record<string, string>).wazeUrl"
                target="_blank"
                rel="noopener"
                class="rounded-lg bg-[#33ccff] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
              >🚗 Lancer Waze</a>
              <a
                v-if="(detail.ride as Record<string, string>).mapsUrl"
                :href="(detail.ride as Record<string, string>).mapsUrl"
                target="_blank"
                rel="noopener"
                class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >🧭 Google Maps</a>
            </div>
            <p v-if="(detail.ride as Record<string, string>).notes" class="mt-2 text-xs italic text-slate-400">
              « {{ (detail.ride as Record<string, string>).notes }} »
            </p>
          </div>

          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Paiement</p>
            <p class="mt-2 font-serif text-2xl font-medium tracking-tight text-slate-900">
              {{ formatMoney(detail.amountCents as number, detail.currency as string) }}
            </p>
            <p v-for="p in (detail.payments as Record<string, unknown>[])" :key="p.id as string" class="mt-1 text-xs">
              <template v-if="p.status === 'PAID'">
                <span class="text-green-700">Réglé</span>
                <span class="text-slate-500"> ({{ methodLabel(p.method) }}) — le {{ formatDateTime(p.createdAt as string) }}</span>
              </template>
              <span v-else-if="p.status === 'PENDING'" class="text-amber-600">À encaisser sur place — {{ shortMethodLabel(p.method) }}</span>
              <span v-else class="text-slate-500">{{ p.status }} — le {{ formatDateTime(p.createdAt as string) }}</span>
            </p>

            <button
              v-if="detail.status !== 'CANCELLED' && (detail.payments as Record<string, unknown>[]).some((p) => p.status === 'PENDING')"
              class="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-green-600 bg-white px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
              :disabled="markingPaid === (detail.id as string)"
              @click="markPaid(detail.id as string)"
            >
              {{ markingPaid === detail.id ? '…' : 'Marquer comme encaissé' }}
            </button>

            <template v-if="(detail.refunds as Record<string, unknown>[]).length">
              <p class="mt-2 text-xs font-medium text-red-600">Remboursements</p>
              <p v-for="r in (detail.refunds as Record<string, unknown>[])" :key="r.id as string" class="text-xs text-red-500">
                − {{ formatMoney(r.amountCents as number, detail.currency as string) }} ({{ r.status }})
              </p>
            </template>
          </div>

          <div v-if="detail.status === 'CONFIRMED'" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <p>Remboursement possible si annulé maintenant : <strong>{{ formatMoney((detail.cancellation as Record<string, number>).currentRefundCents, detail.currency as string) }}</strong></p>
          </div>

          <div v-if="detail.status === 'CONFIRMED' && new Date(detail.scheduledAt as string) <= new Date()">
            <button
              class="btn-primary w-full"
              :disabled="completing === (detail.id as string)"
              @click="markComplete(detail.id as string)"
            >
              {{ completing === detail.id ? '…' : 'Marquer comme terminée' }}
            </button>
          </div>

          <div v-if="canCancel(detail as unknown as BookingRow)">
            <button
              class="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              :disabled="cancelling === (detail.id as string)"
              @click="cancelBooking(detail.id as string)"
            >
              {{ cancelling === detail.id ? '…' : 'Annuler la course' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
