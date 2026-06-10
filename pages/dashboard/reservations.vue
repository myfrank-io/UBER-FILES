<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Réservations' })
const { formatMoney, formatDateTime } = useFormat()

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

const { data, refresh, pending } = await useFetch('/api/dashboard/bookings', { query })

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
const errorMsg = ref('')

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

async function markComplete(id: string) {
  if (!confirm('Marquer cette course comme terminée ?')) return
  completing.value = id
  errorMsg.value = ''
  try {
    await $fetch(`/api/dashboard/bookings/${id}/complete`, { method: 'POST' })
    await refresh()
    if (selected.value === id) await openDetail(id)
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    completing.value = null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: 'Confirmée', cls: 'bg-green-100 text-green-800' },
  COMPLETED: { label: 'Terminée', cls: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Annulée', cls: 'bg-red-100 text-red-700' },
  PENDING_PAYMENT: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-slate-900">Réservations</h1>

    <!-- Filtres -->
    <div class="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="label">Statut</label>
        <select v-model="filterStatus" class="field !py-2 text-sm">
          <option value="">Tous</option>
          <option value="CONFIRMED">Confirmées</option>
          <option value="COMPLETED">Terminées</option>
          <option value="CANCELLED">Annulées</option>
        </select>
      </div>
      <div>
        <label class="label">Du</label>
        <input v-model="filterFrom" type="date" class="field !py-2 text-sm" />
      </div>
      <div>
        <label class="label">Au</label>
        <input v-model="filterTo" type="date" class="field !py-2 text-sm" />
      </div>
      <button class="btn-primary !py-2 text-sm" @click="applyFilters">Filtrer</button>
      <button class="btn-ghost !py-2 text-sm" @click="resetFilters">Réinitialiser</button>
    </div>

    <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

    <!-- Compteur -->
    <p v-if="data" class="mt-4 text-sm text-slate-500">
      {{ data.total }} réservation{{ data.total > 1 ? 's' : '' }}
    </p>

    <!-- Liste -->
    <p v-if="pending" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <div v-if="data && !data.bookings.length && !pending" class="mt-6 text-sm text-slate-500">
      Aucune réservation pour ces critères.
    </div>

    <div class="mt-4 space-y-3">
      <div
        v-for="b in data?.bookings"
        :key="b.id"
        class="card cursor-pointer hover:border-brand-200 transition-colors"
        @click="openDetail(b.id)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="font-semibold text-slate-900">{{ b.customer.name }}</p>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="STATUS_LABELS[b.status]?.cls ?? 'bg-slate-100 text-slate-600'"
              >
                {{ STATUS_LABELS[b.status]?.label ?? b.status }}
              </span>
            </div>
            <p class="mt-1 text-sm text-slate-600">{{ formatDateTime(b.scheduledAt) }}</p>
            <p class="mt-0.5 truncate text-xs text-slate-500">
              <template v-if="b.ride.type === 'TRANSFER'">
                {{ b.ride.pickupAddress }} → {{ b.ride.dropoffAddress }}
                <span v-if="b.ride.roundTrip" class="text-slate-400">(A/R)</span>
              </template>
              <template v-else>Mise à disposition — {{ b.ride.durationHours }}h</template>
            </p>
          </div>
          <p class="shrink-0 font-bold text-slate-900">{{ formatMoney(b.amountCents, b.currency) }}</p>
        </div>

        <!-- Action "Terminer" inline pour les courses confirmées passées -->
        <div
          v-if="b.status === 'CONFIRMED' && new Date(b.scheduledAt) <= new Date()"
          class="mt-3 border-t border-slate-100 pt-3"
          @click.stop
        >
          <button
            class="btn-primary !py-1.5 text-xs"
            :disabled="completing === b.id"
            @click="markComplete(b.id)"
          >
            {{ completing === b.id ? '…' : 'Marquer comme terminée' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="data && data.pages > 1" class="mt-6 flex items-center justify-center gap-3">
      <button class="btn-ghost !py-2 text-sm" :disabled="page === 1" @click="() => { page--; refresh() }">
        ← Précédent
      </button>
      <span class="text-sm text-slate-500">{{ page }} / {{ data.pages }}</span>
      <button class="btn-ghost !py-2 text-sm" :disabled="page === data.pages" @click="() => { page++; refresh() }">
        Suivant →
      </button>
    </div>
  </div>

  <!-- Panneau de détail (slide-over simplifié) -->
  <Teleport to="body">
    <div v-if="selected" class="fixed inset-0 z-40 flex justify-end" @click.self="closeDetail">
      <div class="relative w-full max-w-md overflow-y-auto bg-white shadow-2xl">
        <div class="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 class="font-semibold text-slate-900">Détail de la réservation</h2>
          <button class="text-slate-400 hover:text-slate-700 text-xl leading-none" @click="closeDetail">✕</button>
        </div>

        <div v-if="loadingDetail" class="p-5 text-sm text-slate-400">Chargement…</div>

        <div v-else-if="detail" class="space-y-5 p-5">
          <!-- Statut -->
          <div class="flex items-center gap-2">
            <span
              class="rounded-full px-3 py-1 text-sm font-medium"
              :class="STATUS_LABELS[(detail.status as string)]?.cls"
            >
              {{ STATUS_LABELS[(detail.status as string)]?.label }}
            </span>
            <span class="text-sm text-slate-500">{{ formatDateTime(detail.scheduledAt as string) }}</span>
          </div>

          <!-- Client -->
          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Client</p>
            <p class="mt-2 font-semibold text-slate-900">{{ (detail.customer as Record<string, string>).name }}</p>
            <p class="text-sm text-slate-600">{{ (detail.customer as Record<string, string>).phone }}</p>
            <p class="text-sm text-slate-600">{{ (detail.customer as Record<string, string>).email }}</p>
          </div>

          <!-- Trajet -->
          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Trajet</p>
            <template v-if="(detail.ride as Record<string, unknown>).type === 'TRANSFER'">
              <p class="mt-2 text-sm text-slate-700">
                <span class="font-medium">Départ :</span> {{ (detail.ride as Record<string, string>).pickupAddress }}
              </p>
              <p class="text-sm text-slate-700">
                <span class="font-medium">Arrivée :</span> {{ (detail.ride as Record<string, string>).dropoffAddress }}
              </p>
              <p v-if="(detail.ride as Record<string, unknown>).roundTrip" class="mt-1 text-xs text-slate-500">Aller-retour</p>
              <p v-if="(detail.ride as Record<string, unknown>).distanceMeters" class="mt-1 text-xs text-slate-500">
                {{ Math.round(((detail.ride as Record<string, number>).distanceMeters) / 1000) }} km
              </p>
            </template>
            <template v-else>
              <p class="mt-2 text-sm text-slate-700">Mise à disposition — {{ (detail.ride as Record<string, number>).durationHours }}h</p>
            </template>
            <p v-if="(detail.ride as Record<string, string>).notes" class="mt-2 text-xs italic text-slate-400">
              « {{ (detail.ride as Record<string, string>).notes }} »
            </p>
          </div>

          <!-- Paiement -->
          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Paiement</p>
            <p class="mt-2 text-2xl font-bold text-slate-900">
              {{ formatMoney(detail.amountCents as number, detail.currency as string) }}
            </p>
            <p v-for="p in (detail.payments as Record<string, unknown>[])" :key="p.id as string" class="mt-1 text-xs text-slate-500">
              Payé le {{ formatDateTime(p.createdAt as string) }}
            </p>
            <template v-if="(detail.refunds as Record<string, unknown>[]).length">
              <p class="mt-2 text-xs font-medium text-red-600">Remboursements</p>
              <p v-for="r in (detail.refunds as Record<string, unknown>[])" :key="r.id as string" class="text-xs text-red-500">
                − {{ formatMoney(r.amountCents as number, detail.currency as string) }} ({{ r.status }})
              </p>
            </template>
          </div>

          <!-- Annulation info -->
          <div v-if="detail.status === 'CONFIRMED'" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <p>Remboursement possible si annulé maintenant : <strong>{{ formatMoney((detail.cancellation as Record<string, number>).currentRefundCents, detail.currency as string) }}</strong></p>
          </div>

          <!-- Action Terminer -->
          <div v-if="detail.status === 'CONFIRMED' && new Date(detail.scheduledAt as string) <= new Date()">
            <button
              class="btn-primary w-full"
              :disabled="completing === (detail.id as string)"
              @click="markComplete(detail.id as string)"
            >
              {{ completing === detail.id ? '…' : 'Marquer comme terminée' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
