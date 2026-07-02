<script setup lang="ts">
// Page client : consultation d'un devis validé + paiement (en ligne ou sur place).
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '~/lib/payment-methods'

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
const justConfirmed = computed(() => route.query.confirmed === '1')

// Moyens d'encaissement sur place proposés par le chauffeur.
const onSiteMethods = computed<PaymentMethod[]>(() => (quote.value?.payment?.onSiteMethods ?? []) as PaymentMethod[])
const prepaymentAvailable = computed(() => Boolean(quote.value?.payment?.prepaymentAvailable))
// Moyen sur place choisi par le client (le premier accepté par défaut).
const selectedOnSiteMethod = ref<PaymentMethod | null>(null)
watchEffect(() => {
  if (!selectedOnSiteMethod.value && onSiteMethods.value.length) {
    selectedOnSiteMethod.value = onSiteMethods.value[0]!
  }
})

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

async function confirmOnSite() {
  paying.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/quote/${token}/confirm`, {
      method: 'POST',
      body: { method: selectedOnSiteMethod.value },
    })
    await navigateTo(route.path + '?confirmed=1')
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    errorMsg.value = err?.data?.statusMessage || 'Réservation indisponible.'
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

      <!-- Confirmée + payée en ligne -->
      <div v-if="justPaid || quote.alreadyPaid" class="mt-4 rounded-xl bg-green-50 p-4 text-center">
        <p class="text-3xl">✅</p>
        <p class="mt-2 font-semibold text-green-900">{{ $t('quote.paidTitle') }}</p>
        <p class="text-sm text-green-800">{{ $t('quote.paidBody') }}</p>
      </div>

      <!-- Confirmée, règlement sur place -->
      <div v-else-if="justConfirmed || quote.confirmed" class="mt-4 rounded-xl bg-green-50 p-4 text-center">
        <p class="text-3xl">✅</p>
        <p class="mt-2 font-semibold text-green-900">Course confirmée.</p>
        <p class="text-sm text-green-800">Le règlement se fera sur place, le jour de la course. Un email de confirmation vous a été envoyé.</p>
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

          <!-- Paiement en ligne (prépaiement Stripe/SumUp) -->
          <button
            v-if="prepaymentAvailable"
            class="btn-primary mt-4 w-full"
            :disabled="paying"
            @click="pay"
          >
            {{ paying ? $t('quote.redirecting') : $t('quote.payButton') }}
          </button>

          <!-- Encaissement sur place -->
          <div v-if="onSiteMethods.length" class="mt-4">
            <div v-if="prepaymentAvailable" class="relative my-4 text-center">
              <span class="bg-white px-3 text-xs uppercase tracking-wide text-slate-400">ou</span>
              <span class="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-100"></span>
            </div>

            <div class="rounded-lg border border-slate-200 p-4">
              <p class="text-sm font-medium text-slate-700">Réserver et payer sur place</p>
              <p class="mt-1 text-xs text-slate-500">Le règlement se fait directement auprès du chauffeur, le jour de la course.</p>

              <!-- Choix du moyen quand plusieurs sont acceptés -->
              <div v-if="onSiteMethods.length > 1" class="mt-3 space-y-2">
                <label
                  v-for="m in onSiteMethods"
                  :key="m"
                  class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                >
                  <input v-model="selectedOnSiteMethod" type="radio" :value="m" />
                  {{ PAYMENT_METHOD_LABELS[m] }}
                </label>
              </div>
              <p v-else class="mt-2 text-xs text-slate-500">
                Moyen accepté : <strong>{{ PAYMENT_METHOD_LABELS[onSiteMethods[0]] }}</strong>
              </p>

              <button
                class="mt-4 w-full rounded-xl border border-brand-600 bg-white py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                :disabled="paying"
                @click="confirmOnSite"
              >
                {{ paying ? 'Confirmation…' : 'Réserver (paiement sur place)' }}
              </button>
            </div>
          </div>

          <!-- Aucun moyen de paiement disponible -->
          <div
            v-if="!prepaymentAvailable && !onSiteMethods.length"
            class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Le chauffeur n'a pas encore finalisé sa configuration de paiement. Merci de le contacter.
          </div>

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
