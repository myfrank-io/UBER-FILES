<script setup lang="ts">
// Fiche course unique, partagée par l'accueil, l'agenda et la liste des courses.
// Bottom-sheet sur mobile, modale centrée sur desktop. Regroupe TOUTES les
// actions d'une course : contacter, naviguer (Waze/Maps), encaisser, terminer,
// annuler — pour ne plus dépendre de l'onglet depuis lequel on l'ouvre.
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'
import { formatRideTime } from '~/lib/datetime'

const props = defineProps<{ bookingId: string }>()
const emit = defineEmits<{ close: []; changed: [] }>()

const { formatMoney, formatDateTime } = useFormat()
const { error: toastError, success: toastSuccess } = useToast()

function methodLabel(method: unknown): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? ''
}

// Version courte (« Espèces », « Carte ») pour les phrases qui disent déjà « sur place ».
function shortMethodLabel(method: unknown): string {
  return PAYMENT_METHOD_SHORT_LABELS[method as PaymentMethod] ?? ''
}

const detail = ref<Record<string, unknown> | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  detail.value = null
  try {
    detail.value = await $fetch(`/api/dashboard/bookings/${props.bookingId}`)
  } finally {
    loading.value = false
  }
}
watch(() => props.bookingId, load, { immediate: true })

// Paiement le plus parlant pour la pastille : un règlement effectué (PAID)
// prime sur un encaissement attendu (PENDING), sinon le dernier connu.
const detailPayment = computed(() => {
  const payments = (detail.value?.payments as { method?: string; status?: string }[] | undefined) ?? []
  return (
    payments.find((p) => p.status === 'PAID') ??
    payments.find((p) => p.status === 'PENDING') ??
    payments[payments.length - 1] ??
    null
  )
})

const completing = ref(false)
const markingPaid = ref(false)
const cancelling = ref(false)
const progressing = ref(false)

// ── Suivi de course (jour J) ──
// Étapes signalées par le chauffeur : « je pars » prévient le client par email
// (lien de suivi live) ; « sur place » et « à bord » mettent sa page à jour.
interface TrackingInfo {
  departedAt: string | null
  arrivedAt: string | null
  pickedUpAt: string | null
  etaAt: string | null
  hasLivePosition: boolean
}
const tracking = computed(() => (detail.value?.tracking as TrackingInfo | undefined) ?? null)

// Visible sur une course confirmée dont la prise en charge est dans moins de
// 24 h (ou dont le suivi est déjà entamé).
const showTracking = computed(() => {
  const d = detail.value
  if (!d || d.status !== 'CONFIRMED') return false
  if (tracking.value?.departedAt) return true
  return new Date(d.scheduledAt as string).getTime() - Date.now() < 24 * 3_600_000
})

function trackTime(value: string | null): string {
  if (!value) return ''
  return formatRideTime(value, (detail.value?.timezone as string) ?? 'Europe/Paris')
}

async function progress(action: 'depart' | 'arrive' | 'pickup') {
  if (action === 'depart' && !confirm('Prévenir le client que vous êtes en route ?')) return
  progressing.value = true
  try {
    await $fetch(`/api/dashboard/bookings/${props.bookingId}/progress`, {
      method: 'POST',
      body: { action },
    })
    toastSuccess(
      action === 'depart'
        ? 'Client prévenu — il peut vous suivre en direct.'
        : action === 'arrive'
          ? 'Arrivée signalée.'
          : 'Client à bord.',
    )
    await load()
    emit('changed')
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    progressing.value = false
  }
}

// Le chauffeur peut annuler une course à venir (non terminée, non déjà annulée).
const canCancel = computed(() => {
  const d = detail.value
  if (!d) return false
  return (
    (d.status === 'CONFIRMED' || d.status === 'PENDING_PAYMENT') &&
    new Date(d.scheduledAt as string) > new Date()
  )
})

async function markComplete() {
  if (!confirm('Marquer cette course comme terminée ?')) return
  completing.value = true
  try {
    await $fetch(`/api/dashboard/bookings/${props.bookingId}/complete`, { method: 'POST' })
    await load()
    emit('changed')
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    completing.value = false
  }
}

async function markPaid() {
  if (!confirm('Confirmer l’encaissement de cette course ?')) return
  markingPaid.value = true
  try {
    await $fetch(`/api/dashboard/bookings/${props.bookingId}/mark-paid`, { method: 'POST' })
    toastSuccess('Encaissement enregistré.')
    await load()
    emit('changed')
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    markingPaid.value = false
  }
}

async function cancelBooking() {
  if (!confirm('Annuler cette course ? Le client sera prévenu et intégralement remboursé s’il a payé en ligne.')) return
  cancelling.value = true
  try {
    await $fetch(`/api/dashboard/bookings/${props.bookingId}/cancel`, { method: 'POST' })
    toastSuccess('Course annulée, client prévenu.')
    await load()
    emit('changed')
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.')
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6"
      @click.self="emit('close')"
    >
      <!-- Bottom sheet : hauteur bornée + scroll interne + safe-area sous les actions. -->
      <div class="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white py-2 pl-5 pr-2">
          <h2 class="font-semibold text-slate-900">Détail de la course</h2>
          <button
            class="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div v-if="loading" class="p-5 text-sm text-slate-400">Chargement…</div>

        <div v-else-if="detail" class="space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge :status="(detail.status as string)" />
            <PaymentBadge
              v-if="detailPayment"
              :method="detailPayment.method"
              :status="detailPayment.status"
              :booking-status="(detail.status as string)"
            />
            <span class="text-sm text-slate-500">{{ formatDateTime(detail.scheduledAt as string, detail.timezone as string) }}</span>
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
            <!-- Transfert aéroport : trajet en clair + n° de vol (suivi du retard). -->
            <p v-if="(detail.ride as Record<string, unknown>).airport" class="mt-1.5 text-xs font-semibold text-brand-700">
              ✈️ Transfert aéroport — {{ (detail.ride as Record<string, string>).airport }}<template v-if="(detail.ride as Record<string, unknown>).flightNumber"> · vol {{ (detail.ride as Record<string, string>).flightNumber }}</template>
            </p>
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
            <p v-if="(detail.ride as Record<string, number>).passengers" class="mt-2 text-sm text-slate-700">
              👥 <span class="font-medium">{{ (detail.ride as Record<string, number>).passengers }} personne(s)</span>
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

          <!-- Suivi de course jour J : le client suit la progression en direct
               sur sa page de réservation (mêmes actions que les boutons Telegram). -->
          <div v-if="showTracking" class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Suivi de course</p>
            <p class="mt-1.5 text-xs text-slate-500">
              Prévenez votre client en un geste : il suit votre progression en direct depuis sa page de réservation.
            </p>
            <div class="mt-3 space-y-2">
              <button
                v-if="!tracking?.departedAt"
                class="btn-primary w-full"
                :disabled="progressing"
                @click="progress('depart')"
              >
                {{ progressing ? '…' : '🚗 Je pars — prévenir le client' }}
              </button>
              <template v-else>
                <p class="text-xs font-medium text-green-700">🚗 En route — signalé à {{ trackTime(tracking.departedAt) }}</p>
                <p v-if="!tracking.hasLivePosition && !tracking.pickedUpAt" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  📍 Partagez votre <strong>position en direct</strong> dans la conversation du bot Telegram
                  (📎 → Position) : le client vous verra avancer sur la carte, avec l'heure d'arrivée recalculée.
                </p>
                <button
                  v-if="!tracking.arrivedAt"
                  class="btn-primary w-full"
                  :disabled="progressing"
                  @click="progress('arrive')"
                >
                  {{ progressing ? '…' : '🅿️ Je suis sur place' }}
                </button>
                <p v-else class="text-xs font-medium text-green-700">🅿️ Sur place — signalé à {{ trackTime(tracking.arrivedAt) }}</p>
                <button
                  v-if="tracking.arrivedAt && !tracking.pickedUpAt"
                  class="btn-primary w-full"
                  :disabled="progressing"
                  @click="progress('pickup')"
                >
                  {{ progressing ? '…' : '🧍 Client à bord' }}
                </button>
                <p v-else-if="tracking.pickedUpAt" class="text-xs font-medium text-green-700">
                  🧍 Client à bord à {{ trackTime(tracking.pickedUpAt) }} — pensez à « Marquer comme terminée » à l'arrivée.
                </p>
              </template>
            </div>
          </div>

          <div class="card !p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Paiement</p>
            <p class="mt-2 font-serif text-2xl font-medium tracking-tight text-slate-900">
              {{ formatMoney(detail.amountCents as number, detail.currency as string) }}
            </p>
            <p v-for="p in (detail.payments as Record<string, unknown>[])" :key="p.id as string" class="mt-1 text-xs">
              <template v-if="p.status === 'PAID'">
                <span class="text-green-700">Réglé</span>
                <span class="text-slate-500"> ({{ methodLabel(p.method) }}) — le {{ formatDateTime(p.createdAt as string, detail.timezone as string) }}</span>
              </template>
              <span v-else-if="p.status === 'PENDING'" class="text-amber-600">À encaisser sur place — {{ shortMethodLabel(p.method) }}</span>
              <span v-else class="text-slate-500">{{ p.status }} — le {{ formatDateTime(p.createdAt as string, detail.timezone as string) }}</span>
            </p>

            <button
              v-if="detail.status !== 'CANCELLED' && (detail.payments as Record<string, unknown>[]).some((p) => p.status === 'PENDING')"
              class="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-green-600 bg-white px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
              :disabled="markingPaid"
              @click="markPaid"
            >
              {{ markingPaid ? '…' : 'Marquer comme encaissé' }}
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
            <button class="btn-primary w-full" :disabled="completing" @click="markComplete">
              {{ completing ? '…' : 'Marquer comme terminée' }}
            </button>
          </div>

          <div v-if="canCancel">
            <button
              class="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              :disabled="cancelling"
              @click="cancelBooking"
            >
              {{ cancelling ? '…' : 'Annuler la course' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
