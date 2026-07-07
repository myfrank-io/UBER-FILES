<script setup lang="ts">
// Page client : consultation d'un devis validé + paiement (en ligne ou sur place).
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '~/lib/payment-methods'
import { terminalLabel } from '~/lib/hubs'

const route = useRoute()
const token = route.params.token as string
const { formatMoney, formatDateTime } = useFormat()
const { t } = useI18n()

const { data: quote, error } = await useFetch(`/api/quote/${token}`)
useHead({ title: t('quote.title') })

const paying = ref(false)
const errorMsg = ref('')
const justConfirmed = computed(() => route.query.confirmed === '1')

// Retour d'un paiement en ligne : on NE se fie PAS au paramètre `paid=1` (SumUp
// renvoie ici même si le client a quitté sans payer). On interroge le serveur
// pour connaître le vrai statut avant d'afficher « payé ».
const verifying = ref(false)
const verifiedPaid = ref(false)
const paymentUnconfirmed = ref(false)
const isPaid = computed(() => Boolean(quote.value?.alreadyPaid) || verifiedPaid.value)

onMounted(async () => {
  if (route.query.paid !== '1' || !quote.value || quote.value.alreadyPaid || quote.value.cancelled) return
  verifying.value = true
  const sessionId = route.query.session_id as string | undefined
  // Le webhook peut être légèrement en retard sur un vrai paiement : on réessaie.
  for (let i = 0; i < 4; i++) {
    try {
      const res = await $fetch<{ paid: boolean }>(`/api/quote/${token}/payment-status`, {
        query: sessionId ? { session_id: sessionId } : undefined,
      })
      if (res.paid) {
        verifiedPaid.value = true
        break
      }
    } catch {
      // On réessaie au tour suivant.
    }
    if (i < 3) await new Promise((r) => setTimeout(r, 1500))
  }
  verifying.value = false
  if (!verifiedPaid.value) paymentUnconfirmed.value = true
})

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

    <div v-else-if="quote" class="card">
      <p class="text-sm text-slate-500">{{ quote.driver.displayName }}</p>
      <h1 class="mt-1 font-serif text-xl font-medium tracking-tight text-slate-900">{{ $t('quote.title') }}</h1>

      <!-- Course annulée : prime sur tous les autres états -->
      <div v-if="quote.cancelled" class="mt-4 rounded-xl bg-slate-50 p-4 text-center">
        <p class="text-3xl">❌</p>
        <p class="mt-2 font-semibold text-slate-700">{{ $t('quote.cancelledTitle') }}</p>
        <p class="text-sm text-slate-600">{{ $t('quote.cancelledBody') }}</p>
      </div>

      <!-- Vérification du paiement en cours (retour du prestataire) -->
      <div v-else-if="verifying" class="mt-4 rounded-xl bg-slate-50 p-4 text-center">
        <p class="text-2xl">⏳</p>
        <p class="mt-2 font-semibold text-slate-700">{{ $t('quote.verifying') }}</p>
      </div>

      <!-- Confirmée + payée en ligne (statut réel confirmé par le serveur) -->
      <div v-else-if="isPaid" class="mt-4 rounded-xl bg-green-50 p-4 text-center">
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
          <div v-if="quote.ride.type === 'TRANSFER'">
            <p><strong>{{ $t('quote.transfer') }}</strong>{{ quote.ride.roundTrip ? $t('common.roundTripSuffix') : '' }}</p>
            <RideRoute wrap class="mt-1" :pickup="quote.ride.pickupAddress" :dropoff="quote.ride.dropoffAddress" />
          </div>
          <p v-else>
            <strong>{{ $t('quote.hourly') }}</strong> — {{ $t('quote.hourlyDuration', { hours: quote.ride.durationHours }) }}<template v-if="quote.ride.pickupAddress"><br />{{ quote.ride.pickupAddress }}</template>
          </p>
          <p v-if="terminalLabel(quote.ride.pickupAddress, quote.ride.pickupTerminal)" class="text-slate-500">
            🚪 {{ terminalLabel(quote.ride.pickupAddress, quote.ride.pickupTerminal) }}
          </p>
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
          <span class="font-serif text-2xl font-medium tracking-tight text-slate-900">{{ formatMoney(quote.amountCents, quote.currency) }}</span>
        </div>
        <p v-if="quote.adjusted" class="mt-1 text-xs text-slate-500">
          {{ $t('quote.adjustedNote') }}
        </p>

        <div v-if="quote.status === 'EXPIRED'" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {{ $t('quote.expired') }}
        </div>
        <div v-else-if="quote.status === 'REJECTED'" class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {{ $t('quote.rejectedBody') }}
        </div>
        <template v-else-if="quote.status === 'SENT'">
          <p class="mt-2 text-xs text-slate-400">{{ $t('quote.validUntil', { date: formatDateTime(quote.expiresAt) }) }}</p>

          <!-- Retour de paiement sans confirmation : le client a peut-être quitté sans payer -->
          <p v-if="paymentUnconfirmed" class="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {{ $t('quote.paymentUnconfirmed') }}
          </p>
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

        </template>
        <div v-else class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {{ $t('quote.unavailable') }}
        </div>
      </template>
    </div>
  </div>
</template>
