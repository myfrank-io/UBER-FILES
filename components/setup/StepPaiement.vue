<script setup lang="ts">
// Étape « Paiement » : comment le client règle (en ligne obligatoire / au
// choix / sur place) et confirmation automatique. Même modèle que l'onglet
// Réglages → Paiement & réservations.
import { ONSITE_METHODS, PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'
import { onlinePaymentPolicy, onSitePaymentMethods } from '~/lib/booking-policy'
import { setupApiError } from '~/lib/setup-view'

const { state, result, next } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'paiement'))

type PayChoice = 'ONLINE_REQUIRED' | 'CLIENT_CHOICE' | 'ONSITE_ONLY'
const payChoice = ref<PayChoice>('CLIENT_CHOICE')
const onsiteMethods = ref<PaymentMethod[]>([])
const autoConfirm = ref(false)

let seeded = false
watch(
  () => state.value?.driver,
  (d) => {
    if (!d || seeded) return
    seeded = true
    const policy = onlinePaymentPolicy(d.paymentMethods)
    payChoice.value = policy === 'REQUIRED' ? 'ONLINE_REQUIRED' : policy === 'OPTIONAL' ? 'CLIENT_CHOICE' : 'ONSITE_ONLY'
    onsiteMethods.value = onSitePaymentMethods(d.paymentMethods)
    autoConfirm.value = d.autoAcceptQuotes
  },
  { immediate: true },
)

const CHOICES: { key: PayChoice; title: string; text: string; icon: string }[] = [
  { key: 'CLIENT_CHOICE', title: 'Au choix du client', text: 'Il paie en ligne à l’avance, ou règle sur place le jour J.', icon: '🤝' },
  { key: 'ONLINE_REQUIRED', title: 'Paiement en ligne obligatoire', text: 'La course n’est confirmée qu’une fois payée. Zéro impayé.', icon: '🔒' },
  { key: 'ONSITE_ONLY', title: 'Sur place uniquement', text: 'Carte, espèces ou chèque à bord. Pas de paiement en ligne.', icon: '💵' },
]

const needsOnsite = computed(() => payChoice.value !== 'ONLINE_REQUIRED')
watch(payChoice, (c) => {
  if (c !== 'ONLINE_REQUIRED' && onsiteMethods.value.length === 0) onsiteMethods.value = ['ONSITE_CARD', 'ONSITE_CASH']
})
function toggleOnsite(m: PaymentMethod) {
  const i = onsiteMethods.value.indexOf(m)
  if (i === -1) onsiteMethods.value.push(m)
  else onsiteMethods.value.splice(i, 1)
}
const onsiteMissing = computed(() => needsOnsite.value && onsiteMethods.value.length === 0)

const recap = computed(() => {
  const auto = autoConfirm.value
  switch (payChoice.value) {
    case 'ONLINE_REQUIRED':
      return auto
        ? 'Le client réserve et paie en ligne → course confirmée aussitôt.'
        : 'Le client demande → vous validez → il paie en ligne → course confirmée.'
    case 'CLIENT_CHOICE':
      return auto
        ? 'Le client réserve (en ligne ou règlement sur place) → confirmée aussitôt si le créneau est libre.'
        : 'Le client demande → vous validez → il confirme (en ligne ou règlement sur place).'
    default:
      return auto
        ? 'Le client réserve → confirmée aussitôt si le créneau est libre → règlement le jour J.'
        : 'Le client demande → vous acceptez → course confirmée → règlement le jour J.'
  }
})

const busy = ref(false)
const errorMsg = ref('')

async function save() {
  if (onsiteMissing.value) {
    errorMsg.value = 'Choisissez au moins un moyen de règlement sur place.'
    return
  }
  const methods: PaymentMethod[] =
    payChoice.value === 'ONLINE_REQUIRED'
      ? ['STRIPE_PREPAYMENT']
      : [
          ...(payChoice.value === 'CLIENT_CHOICE' ? (['STRIPE_PREPAYMENT'] as PaymentMethod[]) : []),
          ...ONSITE_METHODS.filter((m) => onsiteMethods.value.includes(m)),
        ]
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/settings', {
      method: 'PATCH',
      body: { paymentMethods: methods, autoAcceptQuotes: autoConfirm.value },
    })
    await $fetch('/api/setup/confirm', { method: 'POST', body: { step: 'paiement' } })
    await next()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    icon="💳"
    title="Comment vos clients paient-ils ?"
    subtitle="Vous pourrez changer d'avis à tout moment."
    :done="step?.done"
  >
    <div class="space-y-2">
      <button
        v-for="c in CHOICES"
        :key="c.key"
        type="button"
        class="flex w-full items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition"
        :class="payChoice === c.key ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 bg-white hover:border-brand-300'"
        :data-testid="`pay-${c.key}`"
        @click="payChoice = c.key"
      >
        <span class="text-2xl" aria-hidden="true">{{ c.icon }}</span>
        <span class="min-w-0">
          <span class="block font-semibold text-slate-900">{{ c.title }}</span>
          <span class="block text-sm text-slate-600">{{ c.text }}</span>
        </span>
      </button>
    </div>

    <div v-if="needsOnsite">
      <p class="label">Sur place, vous acceptez</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="m in ONSITE_METHODS"
          :key="m"
          type="button"
          class="rounded-full border px-3.5 py-2 text-sm font-medium"
          :class="onsiteMethods.includes(m) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'"
          @click="toggleOnsite(m)"
        >{{ onsiteMethods.includes(m) ? '✓ ' : '' }}{{ PAYMENT_METHOD_SHORT_LABELS[m] }}</button>
      </div>
    </div>

    <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <input v-model="autoConfirm" type="checkbox" class="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      <span>
        <span class="block font-medium text-slate-900">Confirmation automatique</span>
        <span class="block text-sm text-slate-600">Si le créneau est libre, la course est confirmée sans que vous ayez à valider chaque demande.</span>
      </span>
    </label>

    <p class="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900"><strong>Concrètement :</strong> {{ recap }}</p>

    <template #help>
      <p>Le <strong>paiement en ligne</strong> passe par votre compte SumUp (ou Stripe) : l'argent arrive directement chez vous. Si vous le proposez, l'étape suivante vous aide à le connecter.</p>
      <p>« Au choix du client » est le réglage le plus courant : il rassure les nouveaux clients et laisse vos habitués régler à bord.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :disabled="onsiteMissing" :error="errorMsg" next-label="C'est bon, continuer" @next="save" />
    </template>
  </SetupStepShell>
</template>
