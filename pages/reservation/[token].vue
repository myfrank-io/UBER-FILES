<script setup lang="ts">
// Page client : gestion d'une réservation confirmée (consultation + annulation).
import { PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'

const route = useRoute()
const token = route.params.token as string
const { formatMoney, formatDateTime } = useFormat()
const { t } = useI18n()

function shortMethod(method: unknown): string {
  return PAYMENT_METHOD_SHORT_LABELS[method as PaymentMethod] ?? ''
}

const { data: booking, error, refresh } = await useFetch(`/api/booking/${token}`)
useHead({ title: t('reservation.title') })

const cancelling = ref(false)
const cancelled = ref(false)
const errorMsg = ref('')

async function cancel() {
  if (!confirm(t('reservation.cancelConfirm'))) return
  cancelling.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/booking/${token}/cancel`, { method: 'POST' })
    cancelled.value = true
    await refresh()
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || t('reservation.cancelError')
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg px-5 pb-10 pt-4">
    <div class="mb-3 flex justify-end">
      <LangSwitcher />
    </div>
    <div v-if="error" class="card text-center">
      <p class="text-3xl">🔒</p>
      <p class="mt-2 font-semibold text-slate-700">{{ $t('common.invalidLink') }}</p>
      <p class="mt-2 text-sm text-slate-500">{{ $t('common.invalidLinkHelp') }}</p>
    </div>

    <div v-else-if="booking" class="card">
      <p class="text-sm text-slate-500">{{ booking.driver.displayName }}</p>
      <h1 class="mt-1 font-serif text-xl font-medium tracking-tight text-slate-900">{{ $t('reservation.title') }}</h1>

      <div
        class="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold"
        :class="booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'"
      >
        {{ booking.status === 'CONFIRMED' ? $t('reservation.statusConfirmed') : booking.status === 'CANCELLED' ? $t('reservation.statusCancelled') : booking.status }}
      </div>

      <div class="mt-4 space-y-1 text-sm text-slate-600">
        <div v-if="booking.ride.type === 'TRANSFER'">
          <p><strong>{{ $t('reservation.transfer') }}</strong>{{ booking.ride.roundTrip ? $t('common.roundTripSuffix') : '' }}</p>
          <RideRoute wrap class="mt-1" :pickup="booking.ride.pickupAddress" :dropoff="booking.ride.dropoffAddress" />
        </div>
        <p v-else><strong>{{ $t('reservation.hourly') }}</strong> — {{ $t('reservation.hourlyDuration', { hours: booking.ride.durationHours }) }}</p>
        <p>{{ $t('reservation.on', { date: formatDateTime(booking.scheduledAt) }) }}</p>
        <p class="font-semibold text-slate-900">{{ formatMoney(booking.amountCents, booking.currency) }}</p>
        <!-- Situation de règlement, en un coup d'œil -->
        <p v-if="booking.payment?.paid" class="text-xs font-medium text-green-700">
          {{
            booking.payment.paidOnline
              ? $t('reservation.paymentPaidOnline')
              : $t('reservation.paymentPaidOnSite', { method: shortMethod(booking.payment.method) })
          }}
        </p>
        <p v-else-if="booking.payment?.method && booking.status === 'CONFIRMED'" class="text-xs font-medium text-amber-600">
          {{ $t('reservation.paymentDueOnSite', { method: shortMethod(booking.payment.method) }) }}
        </p>
      </div>

      <!-- Coordonnées chauffeur : rangées pleine largeur ≥44px (appeler/écrire est
           L'action principale de cette page pour le client). -->
      <div v-if="booking.driver.phone || booking.driver.contactEmail" class="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <p class="font-medium text-slate-800">{{ $t('reservation.driverContact') }}</p>
        <div class="mt-1 divide-y divide-slate-200/70">
          <a
            v-if="booking.driver.phone"
            :href="`tel:${booking.driver.phone}`"
            class="flex min-h-[48px] items-center gap-3 py-2 font-medium text-brand-700"
          >
            <span aria-hidden="true">📞</span>
            <span class="min-w-0 truncate">{{ booking.driver.phone }}</span>
          </a>
          <a
            v-if="booking.driver.contactEmail"
            :href="`mailto:${booking.driver.contactEmail}`"
            class="flex min-h-[48px] items-center gap-3 py-2 font-medium text-brand-700"
          >
            <span aria-hidden="true">✉️</span>
            <span class="min-w-0 truncate">{{ booking.driver.contactEmail }}</span>
          </a>
        </div>
      </div>

      <template v-if="booking.status === 'CONFIRMED'">
        <div class="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <!-- Payé en ligne : on parle remboursement. Sinon (règlement sur place),
               rien n'a été prélevé : on parle simplement d'annulation. -->
          <template v-if="booking.paidOnline">
            <p v-if="booking.cancellation.isFreeNow">
              ✅ {{ $t('reservation.freeCancel', { amount: formatMoney(booking.cancellation.currentRefundCents, booking.currency) }) }}
            </p>
            <p v-else>
              ⚠️ {{ $t('reservation.lateCancel', { hours: booking.cancellation.freeUntilHours, percent: booking.cancellation.retainedPercent, amount: formatMoney(booking.cancellation.currentRefundCents, booking.currency) }) }}
            </p>
          </template>
          <p v-else>
            {{ $t('reservation.cancelNoPayment') }}
          </p>
        </div>

        <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
        <button class="btn-danger mt-4 w-full" :disabled="cancelling" @click="cancel">
          {{ cancelling ? $t('reservation.cancelling') : $t('reservation.cancelButton') }}
        </button>
      </template>

      <div v-else-if="booking.status === 'CANCELLED'" class="mt-5 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-600">
        {{ $t('reservation.alreadyCancelled') }}
      </div>
    </div>
  </div>
</template>
