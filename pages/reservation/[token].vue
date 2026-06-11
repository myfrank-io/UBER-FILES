<script setup lang="ts">
// Page client : gestion d'une réservation confirmée (consultation + annulation).
const route = useRoute()
const token = route.params.token as string
const { formatMoney, formatDateTime } = useFormat()

const { data: booking, error, refresh } = await useFetch(`/api/booking/${token}`)
useHead({ title: 'Ma réservation' })

const cancelling = ref(false)
const cancelled = ref(false)
const errorMsg = ref('')

async function cancel() {
  if (!confirm('Confirmer l’annulation de cette course ?')) return
  cancelling.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/booking/${token}/cancel`, { method: 'POST' })
    cancelled.value = true
    await refresh()
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || 'Annulation impossible.'
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg px-5 py-10">
    <div v-if="error" class="card text-center">
      <p class="text-3xl">🔒</p>
      <p class="mt-2 font-semibold text-slate-700">Lien invalide ou expiré.</p>
    </div>

    <div v-else-if="booking" class="card">
      <p class="text-sm text-slate-500">{{ booking.driver.displayName }}</p>
      <h1 class="mt-1 text-xl font-bold text-slate-900">Ma réservation</h1>

      <div
        class="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold"
        :class="booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'"
      >
        {{ booking.status === 'CONFIRMED' ? 'Confirmée' : booking.status === 'CANCELLED' ? 'Annulée' : booking.status }}
      </div>

      <div class="mt-4 space-y-1 text-sm text-slate-600">
        <p v-if="booking.ride.type === 'TRANSFER'">
          <strong>Transfert</strong>{{ booking.ride.roundTrip ? ' (aller-retour)' : '' }}<br />
          {{ booking.ride.pickupAddress }} → {{ booking.ride.dropoffAddress }}
        </p>
        <p v-else><strong>Mise à disposition</strong> — {{ booking.ride.durationHours }} h</p>
        <p>Le {{ formatDateTime(booking.scheduledAt) }}</p>
        <p class="font-semibold text-slate-900">{{ formatMoney(booking.amountCents, booking.currency) }}</p>
      </div>

      <!-- Coordonnées chauffeur -->
      <div v-if="booking.driver.phone || booking.driver.contactEmail" class="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <p class="mb-1 font-medium text-slate-800">Contact chauffeur</p>
        <p v-if="booking.driver.phone">📞 <a :href="`tel:${booking.driver.phone}`" class="text-brand-600 hover:underline">{{ booking.driver.phone }}</a></p>
        <p v-if="booking.driver.contactEmail">✉️ <a :href="`mailto:${booking.driver.contactEmail}`" class="text-brand-600 hover:underline">{{ booking.driver.contactEmail }}</a></p>
      </div>

      <template v-if="booking.status === 'CONFIRMED'">
        <div class="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p v-if="booking.cancellation.isFreeNow">
            ✅ Annulation gratuite (remboursement intégral de
            {{ formatMoney(booking.cancellation.currentRefundCents, booking.currency) }}).
          </p>
          <p v-else>
            ⚠️ Passé le délai de {{ booking.cancellation.freeUntilHours }}h,
            {{ booking.cancellation.retainedPercent }}% sont retenus. Remboursement actuel :
            {{ formatMoney(booking.cancellation.currentRefundCents, booking.currency) }}.
          </p>
        </div>

        <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
        <button class="btn-danger mt-4 w-full" :disabled="cancelling" @click="cancel">
          {{ cancelling ? 'Annulation…' : 'Annuler la course' }}
        </button>
      </template>

      <div v-else-if="booking.status === 'CANCELLED'" class="mt-5 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-600">
        Cette course a été annulée.
      </div>
    </div>
  </div>
</template>
