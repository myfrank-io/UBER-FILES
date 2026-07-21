<script setup lang="ts">
// Vue « Liste » de l'onglet Courses : historique et recherche des réservations.
// Filtres mobile-first : puces de statut appliquées immédiatement + plage de
// dates optionnelle (pas de bouton « Filtrer » — tout est réactif).
const { formatMoney, formatDateTime } = useFormat()
const { error: toastError, success: toastSuccess } = useToast()

// ─── Filtres ──────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: '', label: 'Toutes' },
  { value: 'CONFIRMED', label: 'Confirmées' },
  { value: 'COMPLETED', label: 'Terminées' },
  { value: 'CANCELLED', label: 'Annulées' },
]

const filterStatus = ref('')
const filterFrom = ref('')
const filterTo = ref('')
const page = ref(1)

// Tout changement de filtre repart à la première page.
watch([filterStatus, filterFrom, filterTo], () => { page.value = 1 })

const hasFilters = computed(() => Boolean(filterStatus.value || filterFrom.value || filterTo.value))
function resetFilters() {
  filterStatus.value = ''
  filterFrom.value = ''
  filterTo.value = ''
  page.value = 1
}

const query = computed(() => ({
  ...(filterStatus.value ? { status: filterStatus.value } : {}),
  ...(filterFrom.value ? { from: filterFrom.value } : {}),
  ...(filterTo.value ? { to: filterTo.value } : {}),
  page: page.value,
}))

// query est réactif : useFetch relance la requête à chaque changement.
const { data, refresh, pending } = await useFetch('/api/dashboard/bookings', { query, lazy: true })

// ─── Fiche course (composant partagé) ────────────────────────────────────────

const selected = ref<string | null>(null)

// ─── Actions rapides sur les cartes ──────────────────────────────────────────

const completing = ref<string | null>(null)
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

async function markComplete(id: string) {
  if (!confirm('Marquer cette course comme terminée ?')) return
  completing.value = id
  try {
    await $fetch(`/api/dashboard/bookings/${id}/complete`, { method: 'POST' })
    await refresh()
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    completing.value = null
  }
}

async function markPaid(id: string) {
  if (!confirm('Confirmer l’encaissement de cette course ?')) return
  markingPaid.value = id
  try {
    await $fetch(`/api/dashboard/bookings/${id}/mark-paid`, { method: 'POST' })
    toastSuccess('Encaissement enregistré.')
    await refresh()
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    markingPaid.value = null
  }
}

// Réponse à une demande de report d'horaire du client (course proche).
const respondingReschedule = ref<string | null>(null)
async function respondReschedule(id: string, action: 'accept' | 'refuse') {
  respondingReschedule.value = id
  try {
    await $fetch(`/api/dashboard/bookings/${id}/reschedule`, { method: 'POST', body: { action } })
    toastSuccess(action === 'accept' ? 'Nouvel horaire appliqué.' : 'Modification refusée.')
    await refresh()
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    respondingReschedule.value = null
  }
}
</script>

<template>
  <div>
    <!-- Puces de statut : défilement horizontal sur mobile, application immédiate. -->
    <div class="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div class="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        <button
          v-for="s in STATUSES"
          :key="s.value"
          class="min-h-[40px] whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors"
          :class="filterStatus === s.value
            ? 'border-brand-600 bg-brand-50 text-brand-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'"
          @click="filterStatus = s.value"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Plage de dates (optionnelle). Grille 2 colonnes + min-w-0 : les champs
         date (largeur intrinsèque iOS) ne peuvent ni déborder ni se chevaucher. -->
    <div class="mt-3 grid grid-cols-2 gap-3">
      <div class="min-w-0">
        <label class="label" for="bookings-from">Du</label>
        <input id="bookings-from" v-model="filterFrom" type="date" class="field !py-2.5" />
      </div>
      <div class="min-w-0">
        <label class="label" for="bookings-to">Au</label>
        <input id="bookings-to" v-model="filterTo" type="date" class="field !py-2.5" />
      </div>
    </div>
    <!-- Rangée dédiée (jamais en concurrence avec les champs sur mobile) -->
    <button
      v-if="hasFilters"
      class="mt-1 flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      @click="resetFilters"
    >
      ✕ Réinitialiser les filtres
    </button>

    <!-- Compteur -->
    <p v-if="data" class="mt-4 text-sm text-slate-500">
      {{ data.total }} réservation{{ data.total > 1 ? 's' : '' }}
    </p>

    <p v-if="pending && !data" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <div v-if="data && !data.bookings.length && !pending" class="mt-6 text-sm text-slate-500">
      Aucune réservation pour ces critères.
    </div>

    <div class="mt-4 space-y-3">
      <div
        v-for="b in data?.bookings"
        :key="b.id"
        class="card cursor-pointer transition-colors hover:border-brand-200"
        @click="selected = b.id"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p class="font-semibold text-slate-900">{{ b.customer.name }}</p>
              <StatusBadge :status="b.status" />
            </div>
            <p class="mt-1 text-sm text-slate-600">{{ formatDateTime(b.scheduledAt, data?.timezone) }}</p>
            <!-- Adresses en texte simple sur la carte (le tap ouvre la fiche, où les
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

        <!-- Demande de report d'horaire du client (course proche) : à valider. -->
        <div
          v-if="b.pendingScheduledAt && b.status === 'CONFIRMED'"
          class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
          @click.stop
        >
          <p class="text-xs font-semibold text-amber-800">🗓️ Demande de modification d'horaire</p>
          <p class="mt-0.5 text-sm text-slate-700">
            Nouvel horaire souhaité : <strong>{{ formatDateTime(b.pendingScheduledAt, data?.timezone) }}</strong>
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              class="btn-primary flex-1 !py-2 text-xs"
              :disabled="respondingReschedule === b.id"
              @click="respondReschedule(b.id, 'accept')"
            >
              {{ respondingReschedule === b.id ? '…' : 'Accepter' }}
            </button>
            <button
              class="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              :disabled="respondingReschedule === b.id"
              @click="respondReschedule(b.id, 'refuse')"
            >
              Refuser
            </button>
          </div>
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
      <AppPagination v-if="data" :page="page" :pages="data.pages" @change="(p) => { page = p }" />
    </div>

    <!-- Fiche course partagée -->
    <BookingDetail
      v-if="selected"
      :booking-id="selected"
      @close="selected = null"
      @changed="refresh()"
    />
  </div>
</template>
