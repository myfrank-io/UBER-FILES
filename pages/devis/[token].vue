<script setup lang="ts">
// Page client : consultation d'un devis validé + paiement.
const route = useRoute()
const token = route.params.token as string
const { formatMoney, formatDateTime } = useFormat()
const config = useRuntimeConfig()
const { t } = useI18n()

const { data: quote, error } = await useFetch(`/api/quote/${token}`)
useHead({ title: t('quote.title') })

const paying = ref(false)
const errorMsg = ref('')
const justPaid = computed(() => route.query.paid === '1')

async function pay() {
  paying.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ url: string }>(`/api/quote/${token}/checkout`, { method: 'POST' })
    if (res.url) window.location.href = res.url
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || t('quote.payError')
    paying.value = false
  }
}

async function devConfirm() {
  paying.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dev/confirm-booking', { method: 'POST', body: { quoteId: quote.value!.id } })
    await navigateTo(route.path + '?paid=1')
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || t('common.genericError')
    paying.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg px-5 py-10">
    <div v-if="error" class="card text-center">
      <p class="text-3xl">🔒</p>
      <p class="mt-2 font-semibold text-slate-700">{{ $t('common.invalidLink') }}</p>
    </div>

    <div v-else-if="quote" class="card">
      <p class="text-sm text-slate-500">{{ quote.driver.displayName }}</p>
      <h1 class="mt-1 text-xl font-bold text-slate-900">{{ $t('quote.title') }}</h1>

      <div v-if="justPaid || quote.alreadyPaid" class="mt-4 rounded-xl bg-green-50 p-4 text-center">
        <p class="text-3xl">✅</p>
        <p class="mt-2 font-semibold text-green-900">{{ $t('quote.paidTitle') }}</p>
        <p class="text-sm text-green-800">{{ $t('quote.paidBody') }}</p>
      </div>

      <template v-else>
        <div class="mt-4 space-y-1 text-sm text-slate-600">
          <p v-if="quote.ride.type === 'TRANSFER'">
            <strong>{{ $t('quote.transfer') }}</strong>{{ quote.ride.roundTrip ? $t('common.roundTripSuffix') : '' }}<br />
            {{ quote.ride.pickupAddress }} → {{ quote.ride.dropoffAddress }}
          </p>
          <p v-else><strong>{{ $t('quote.hourly') }}</strong> — {{ $t('quote.hourlyDuration', { hours: quote.ride.durationHours }) }}</p>
          <p>{{ $t('quote.on', { date: formatDateTime(quote.ride.scheduledAt) }) }}</p>
        </div>

        <ul class="mt-4 space-y-1 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <li v-for="(line, i) in quote.breakdown" :key="i" class="flex justify-between">
            <span>{{ line.label }}<span v-if="line.detail"> — {{ line.detail }}</span></span>
            <span>{{ formatMoney(line.amountCents, quote.currency) }}</span>
          </li>
        </ul>

        <div class="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
          <span class="font-medium text-slate-700">{{ $t('quote.totalToPay') }}</span>
          <span class="text-2xl font-bold text-slate-900">{{ formatMoney(quote.amountCents, quote.currency) }}</span>
        </div>

        <div v-if="quote.status === 'EXPIRED'" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {{ $t('quote.expired') }}
        </div>
        <template v-else-if="quote.status === 'SENT'">
          <p class="mt-2 text-xs text-slate-400">{{ $t('quote.validUntil', { date: formatDateTime(quote.expiresAt) }) }}</p>
          <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>
          <button class="btn-primary mt-4 w-full" :disabled="paying" @click="pay">
            {{ paying ? $t('quote.redirecting') : $t('quote.payButton') }}
          </button>
          <!-- Bouton de test dev — visible uniquement si devTools actif -->
          <button
            v-if="config.public.devTools"
            class="mt-2 w-full rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            :disabled="paying"
            @click="devConfirm"
          >
            🧪 Confirmer sans payer (test dev)
          </button>
        </template>
        <div v-else class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {{ $t('quote.unavailable') }}
        </div>
      </template>
    </div>
  </div>
</template>
