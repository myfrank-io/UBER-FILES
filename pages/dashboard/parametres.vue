<script setup lang="ts">
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '~/lib/payment-methods'

definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Réglages' })
const { formatMoney } = useFormat()

const { data: me, refresh } = await useFetch('/api/dashboard/me')
const connecting = ref(false)
const saving = ref<string | null>(null)
const errorMsg = ref('')
const successMsg = ref('')

// ─── Stripe ────────────────────────────────────────────────────────────────

async function connectStripe() {
  connecting.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/dashboard/stripe/onboard', { method: 'POST' })
    if (res.url) window.location.href = res.url
  } catch {
    connecting.value = false
  }
}

// ─── SumUp ─────────────────────────────────────────────────────────────────

const SUMUP_MESSAGES: Record<string, { type: 'success' | 'error'; text: string }> = {
  connected: { type: 'success', text: 'Compte SumUp connecté. Vous pouvez encaisser vos courses.' },
  denied: { type: 'error', text: 'Connexion SumUp refusée.' },
  invalid_state: { type: 'error', text: 'Session de connexion expirée, réessayez.' },
  error: { type: 'error', text: 'Échec de la connexion SumUp. Réessayez.' },
}

async function connectSumup() {
  connecting.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/payments/sumup/connect', { method: 'POST' })
    if (res.url) window.location.href = res.url
  } catch {
    connecting.value = false
  }
}

async function disconnectSumup() {
  if (!confirm('Déconnecter votre compte SumUp ? Vous ne pourrez plus encaisser tant qu’un compte n’est pas reconnecté.')) return
  await call('sumup-disconnect', () => $fetch('/api/payments/sumup/disconnect', { method: 'POST' }))
}

const route = useRoute()
onMounted(() => {
  if (route.query.stripe) refresh()
  const code = route.query.sumup as string | undefined
  if (code) {
    refresh()
    const msg = SUMUP_MESSAGES[code]
    if (msg?.type === 'success') successMsg.value = msg.text
    else if (msg) errorMsg.value = msg.text
  }
})

// ─── Moyens de paiement acceptés ───────────────────────────────────────────

const paymentMethods = ref<PaymentMethod[]>([])

watchEffect(() => {
  const m = (me.value as Record<string, unknown>)?.paymentMethods as PaymentMethod[] | undefined
  if (m) paymentMethods.value = [...m]
})

// Stripe doit être opérationnel pour proposer effectivement le prépaiement en ligne.
const stripeReady = computed(() => {
  const s = (me.value as Record<string, unknown>)?.stripe as Record<string, unknown> | undefined
  return Boolean(s?.connected && s?.chargesEnabled)
})

function toggleMethod(method: PaymentMethod) {
  const i = paymentMethods.value.indexOf(method)
  if (i === -1) paymentMethods.value.push(method)
  else paymentMethods.value.splice(i, 1)
}

async function savePaymentMethods() {
  await call('payment-methods', () =>
    $fetch('/api/dashboard/settings', {
      method: 'PATCH',
      body: { paymentMethods: paymentMethods.value },
    }),
  )
}

// ─── Paramètres métier ─────────────────────────────────────────────────────

const settings = reactive({
  minimumFareCents: 0,
  minLeadTimeMinutes: 0,
  quoteExpiryHours: 24,
  approachBufferMinutes: 30,
})

watchEffect(() => {
  if (!me.value) return
  const d = me.value as Record<string, unknown>
  settings.minimumFareCents = (d.minimumFareCents as number) ?? 0
  settings.minLeadTimeMinutes = (d.minLeadTimeMinutes as number) ?? 0
  settings.quoteExpiryHours = (d.quoteExpiryHours as number) ?? 24
  settings.approachBufferMinutes = (d.approachBufferMinutes as number) ?? 30
})

async function saveSettings() {
  await call('settings', () =>
    $fetch('/api/dashboard/settings', {
      method: 'PATCH',
      body: {
        minimumFareCents: settings.minimumFareCents,
        minLeadTimeMinutes: settings.minLeadTimeMinutes,
        quoteExpiryHours: settings.quoteExpiryHours,
        approachBufferMinutes: settings.approachBufferMinutes,
      },
    }),
  )
}

// ─── Politique d'annulation ───────────────────────────────────────────────

const cancelPolicy = reactive({ freeUntilHours: 24, retainedPercent: 50 })

watchEffect(() => {
  const p = (me.value as Record<string, unknown>)?.cancellationPolicy as Record<string, number> | null
  if (!p) return
  cancelPolicy.freeUntilHours = p.freeUntilHours ?? 24
  cancelPolicy.retainedPercent = p.retainedPercent ?? 50
})

async function saveCancelPolicy() {
  await call('cancel', () =>
    $fetch('/api/dashboard/cancellation-policy', { method: 'PATCH', body: cancelPolicy }),
  )
}

// ─── Grilles transfert ────────────────────────────────────────────────────

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function minuteToTime(m: number) {
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}h${String(min).padStart(2, '0')}`
}

function timeToMinute(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minuteToInput(m: number): string {
  const h = String(Math.floor((m % 1440) / 60)).padStart(2, '0')
  const min = String(m % 60).padStart(2, '0')
  return `${h}:${min}`
}

// Form ajout bande transfert
const newBand = reactive({
  name: '',
  pricePerKmEuros: '',
  startTime: '06:00',
  endTime: '22:00',
  daysOfWeek: [] as number[],
  priority: 0,
  isDefault: false,
})

const editingBand = ref<string | null>(null)
const editBandForm = reactive({
  name: '',
  pricePerKmEuros: '',
  startTime: '06:00',
  endTime: '22:00',
  daysOfWeek: [] as number[],
  priority: 0,
  isDefault: false,
})

function startEditBand(b: Record<string, unknown>) {
  editingBand.value = b.id as string
  editBandForm.name = b.name as string
  editBandForm.pricePerKmEuros = ((b.pricePerKmCents as number) / 100).toFixed(2)
  editBandForm.startTime = minuteToInput(b.startMinute as number)
  editBandForm.endTime = minuteToInput(b.endMinute as number)
  editBandForm.daysOfWeek = [...(b.daysOfWeek as number[])]
  editBandForm.priority = b.priority as number
  editBandForm.isDefault = b.isDefault as boolean
}

async function addBand() {
  await call('band-add', async () => {
    await $fetch('/api/dashboard/rates/transfer', {
      method: 'POST',
      body: {
        name: newBand.name,
        pricePerKmCents: Math.round(parseFloat(newBand.pricePerKmEuros) * 100),
        startMinute: timeToMinute(newBand.startTime),
        endMinute: timeToMinute(newBand.endTime),
        daysOfWeek: newBand.daysOfWeek,
        priority: newBand.priority,
        isDefault: newBand.isDefault,
      },
    })
    newBand.name = ''
    newBand.pricePerKmEuros = ''
    newBand.startTime = '06:00'
    newBand.endTime = '22:00'
    newBand.daysOfWeek = []
    newBand.priority = 0
    newBand.isDefault = false
  })
}

async function updateBand(id: string) {
  await call(`band-edit-${id}`, async () => {
    await $fetch(`/api/dashboard/rates/transfer/${id}`, {
      method: 'PATCH',
      body: {
        name: editBandForm.name,
        pricePerKmCents: Math.round(parseFloat(editBandForm.pricePerKmEuros) * 100),
        startMinute: timeToMinute(editBandForm.startTime),
        endMinute: timeToMinute(editBandForm.endTime),
        daysOfWeek: editBandForm.daysOfWeek,
        priority: editBandForm.priority,
        isDefault: editBandForm.isDefault,
      },
    })
    editingBand.value = null
  })
}

async function deleteBand(id: string) {
  if (!confirm('Supprimer cette bande tarifaire ?')) return
  await call(`band-del-${id}`, () =>
    $fetch(`/api/dashboard/rates/transfer/${id}`, { method: 'DELETE' }),
  )
}

// ─── Grilles horaires ─────────────────────────────────────────────────────

const newTier = reactive({ minHours: 1, pricePerHourEuros: '' })
const editingTier = ref<string | null>(null)
const editTierForm = reactive({ minHours: 1, pricePerHourEuros: '' })

function startEditTier(t: Record<string, unknown>) {
  editingTier.value = t.id as string
  editTierForm.minHours = t.minHours as number
  editTierForm.pricePerHourEuros = ((t.pricePerHourCents as number) / 100).toFixed(2)
}

async function addTier() {
  await call('tier-add', async () => {
    await $fetch('/api/dashboard/rates/hourly', {
      method: 'POST',
      body: {
        minHours: newTier.minHours,
        pricePerHourCents: Math.round(parseFloat(newTier.pricePerHourEuros) * 100),
      },
    })
    newTier.minHours = 1
    newTier.pricePerHourEuros = ''
  })
}

async function updateTier(id: string) {
  await call(`tier-edit-${id}`, async () => {
    await $fetch(`/api/dashboard/rates/hourly/${id}`, {
      method: 'PATCH',
      body: {
        minHours: editTierForm.minHours,
        pricePerHourCents: Math.round(parseFloat(editTierForm.pricePerHourEuros) * 100),
      },
    })
    editingTier.value = null
  })
}

async function deleteTier(id: string) {
  if (!confirm('Supprimer ce palier ?')) return
  await call(`tier-del-${id}`, () =>
    $fetch(`/api/dashboard/rates/hourly/${id}`, { method: 'DELETE' }),
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────

async function call(key: string, fn: () => Promise<unknown>) {
  saving.value = key
  errorMsg.value = ''
  successMsg.value = ''
  try {
    await fn()
    await refresh()
    successMsg.value = 'Enregistré.'
    setTimeout(() => { successMsg.value = '' }, 3000)
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    saving.value = null
  }
}

const transferBands = computed(() => (me.value as Record<string, unknown>)?.transferBands as Record<string, unknown>[] ?? [])
const hourlyTiers = computed(() => (me.value as Record<string, unknown>)?.hourlyTiers as Record<string, unknown>[] ?? [])
const currency = computed(() => ((me.value as Record<string, unknown>)?.currency as string) ?? 'eur')
const surcharges = computed(() => (me.value as Record<string, unknown>)?.surcharges as Record<string, unknown>[] ?? [])

// ─── Suppléments ──────────────────────────────────────────────────────────

const newSurcharge = reactive({ name: '', kind: 'FIXED' as 'FIXED' | 'PERCENT', amountDisplay: '', autoApply: false })
const editingSurcharge = ref<string | null>(null)
const editSurchargeForm = reactive({ name: '', kind: 'FIXED' as 'FIXED' | 'PERCENT', amountDisplay: '', autoApply: false })

function surchargeAmount(s: Record<string, unknown>): string {
  if (s.kind === 'PERCENT') return `${((s.amount as number) / 100).toFixed(1)} %`
  return `+ ${formatMoney(s.amount as number, currency.value)}`
}

function startEditSurcharge(s: Record<string, unknown>) {
  editingSurcharge.value = s.id as string
  editSurchargeForm.name = s.name as string
  editSurchargeForm.kind = s.kind as 'FIXED' | 'PERCENT'
  editSurchargeForm.amountDisplay = s.kind === 'PERCENT'
    ? ((s.amount as number) / 100).toFixed(1)
    : ((s.amount as number) / 100).toFixed(2)
  editSurchargeForm.autoApply = s.autoApply as boolean
}

function parseSurchargeAmount(kind: 'FIXED' | 'PERCENT', display: string): number {
  return kind === 'PERCENT'
    ? Math.round(parseFloat(display) * 100)
    : Math.round(parseFloat(display) * 100)
}

async function addSurcharge() {
  await call('surcharge-add', async () => {
    await $fetch('/api/dashboard/surcharges', {
      method: 'POST',
      body: {
        name: newSurcharge.name,
        kind: newSurcharge.kind,
        amount: parseSurchargeAmount(newSurcharge.kind, newSurcharge.amountDisplay),
        autoApply: newSurcharge.autoApply,
      },
    })
    newSurcharge.name = ''
    newSurcharge.amountDisplay = ''
    newSurcharge.autoApply = false
  })
}

async function updateSurcharge(id: string) {
  await call(`surcharge-edit-${id}`, async () => {
    await $fetch(`/api/dashboard/surcharges/${id}`, {
      method: 'PATCH',
      body: {
        name: editSurchargeForm.name,
        kind: editSurchargeForm.kind,
        amount: parseSurchargeAmount(editSurchargeForm.kind, editSurchargeForm.amountDisplay),
        autoApply: editSurchargeForm.autoApply,
      },
    })
    editingSurcharge.value = null
  })
}

async function deleteSurcharge(id: string) {
  if (!confirm('Supprimer ce supplément ?')) return
  await call(`surcharge-del-${id}`, () =>
    $fetch(`/api/dashboard/surcharges/${id}`, { method: 'DELETE' }),
  )
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <h1 class="text-2xl font-bold text-slate-900">Réglages</h1>

    <!-- Notifications globales -->
    <p v-if="successMsg" class="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{{ successMsg }}</p>
    <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

    <!-- Page publique -->
    <div v-if="me" class="card">
      <h2 class="font-semibold text-slate-900">Ma page publique</h2>
      <p class="mt-1 text-sm text-slate-600">
        Accessible sur
        <NuxtLink :to="`/${(me as Record<string, unknown>).slug}`" class="font-medium text-brand-700 hover:underline">/{{ (me as Record<string, unknown>).slug }}</NuxtLink>
      </p>
    </div>

    <!-- SumUp (prestataire de paiement principal) -->
    <div v-if="me" class="card">
      <h2 class="font-semibold text-slate-900">Paiement (SumUp)</h2>
      <p class="mt-1 text-sm text-slate-600">
        Connectez votre compte SumUp : les paiements de vos courses arrivent directement chez vous.
      </p>
      <div class="mt-3">
        <p v-if="((me as Record<string, unknown>).sumup as Record<string, unknown>)?.connected" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
          ✅ Compte SumUp connecté — encaissement actif
        </p>
        <p v-else class="text-sm text-slate-500">Aucun compte SumUp connecté.</p>
      </div>
      <div class="mt-4 flex gap-2">
        <button class="btn-primary" :disabled="connecting" @click="connectSumup">
          {{ connecting ? '…' : ((me as Record<string, unknown>).sumup as Record<string, unknown>)?.connected ? 'Reconnecter SumUp' : 'Connecter SumUp' }}
        </button>
        <button
          v-if="((me as Record<string, unknown>).sumup as Record<string, unknown>)?.connected"
          class="btn-ghost"
          :disabled="saving === 'sumup-disconnect'"
          @click="disconnectSumup"
        >
          Déconnecter
        </button>
      </div>
    </div>

    <!-- Stripe (alternative — affiché si déjà utilisé) -->
    <div v-if="me && ((me as Record<string, unknown>).stripe as Record<string, unknown>)?.connected" class="card">
      <h2 class="font-semibold text-slate-900">Paiement (Stripe)</h2>
      <div class="mt-3">
        <p v-if="((me as Record<string, unknown>).stripe as Record<string, unknown>).chargesEnabled" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
          ✅ Compte actif — paiements et reversements activés
        </p>
        <p v-else class="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
          ⏳ Onboarding à finaliser
        </p>
      </div>
      <button class="btn-primary mt-4" :disabled="connecting" @click="connectStripe">
        {{ connecting ? '…' : 'Reprendre l\'onboarding' }}
      </button>
    </div>

    <!-- Moyens de paiement acceptés -->
    <form v-if="me" class="card space-y-4" @submit.prevent="savePaymentMethods">
      <div>
        <h2 class="font-semibold text-slate-900">Moyens de paiement acceptés</h2>
        <p class="mt-1 text-sm text-slate-600">
          Choisissez comment vos clients règlent leurs courses. Vous pouvez exiger un
          paiement en ligne à l'avance, ou tout encaisser sur place le jour de la course
          (carte, espèces, chèque) — c'est vous qui décidez.
        </p>
      </div>

      <div class="space-y-2">
        <label
          v-for="method in PAYMENT_METHODS"
          :key="method"
          class="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-brand-200"
        >
          <input
            type="checkbox"
            class="mt-0.5 rounded"
            :checked="paymentMethods.includes(method)"
            @change="toggleMethod(method)"
          />
          <span class="flex-1">
            <span class="text-sm font-medium text-slate-800">{{ PAYMENT_METHOD_LABELS[method] }}</span>
            <span
              v-if="method === 'STRIPE_PREPAYMENT' && paymentMethods.includes(method) && !stripeReady"
              class="mt-1 block text-xs text-amber-600"
            >
              ⚠️ Configurez d'abord votre compte Stripe ci-dessus pour activer le paiement en ligne.
            </span>
          </span>
        </label>
      </div>

      <p v-if="!paymentMethods.length" class="text-xs text-red-600">
        Sélectionnez au moins un moyen de paiement.
      </p>

      <div class="flex justify-end">
        <button
          type="submit"
          class="btn-primary"
          :disabled="saving === 'payment-methods' || !paymentMethods.length"
        >
          {{ saving === 'payment-methods' ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>

    <!-- Paramètres métier -->
    <form class="card space-y-4" @submit.prevent="saveSettings">
      <h2 class="font-semibold text-slate-900">Paramètres</h2>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="minFare">Prix minimum (€)</label>
          <input
            id="minFare"
            :value="(settings.minimumFareCents / 100).toFixed(2)"
            type="number"
            step="0.01"
            min="0"
            class="field"
            @change="settings.minimumFareCents = Math.round(parseFloat(($event.target as HTMLInputElement).value) * 100)"
          />
        </div>
        <div>
          <label class="label" for="leadTime">Délai minimum de réservation (min)</label>
          <input id="leadTime" v-model.number="settings.minLeadTimeMinutes" type="number" min="0" class="field" />
        </div>
        <div>
          <label class="label" for="quoteExpiry">Validité des devis (h)</label>
          <input id="quoteExpiry" v-model.number="settings.quoteExpiryHours" type="number" min="1" max="168" class="field" />
        </div>
        <div>
          <label class="label" for="approach">Trajet d'approche bloqué (min)</label>
          <input id="approach" v-model.number="settings.approachBufferMinutes" type="number" min="0" max="180" class="field" />
        </div>
      </div>
      <div class="flex justify-end">
        <button type="submit" class="btn-primary" :disabled="saving === 'settings'">
          {{ saving === 'settings' ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>

    <!-- Politique d'annulation -->
    <form class="card space-y-4" @submit.prevent="saveCancelPolicy">
      <h2 class="font-semibold text-slate-900">Politique d'annulation</h2>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="freeUntil">Annulation gratuite jusqu'à (h avant)</label>
          <input id="freeUntil" v-model.number="cancelPolicy.freeUntilHours" type="number" min="0" max="720" class="field" />
        </div>
        <div>
          <label class="label" for="retained">% retenu si annulation tardive</label>
          <input id="retained" v-model.number="cancelPolicy.retainedPercent" type="number" min="0" max="100" class="field" />
        </div>
      </div>
      <div class="flex justify-end">
        <button type="submit" class="btn-primary" :disabled="saving === 'cancel'">
          {{ saving === 'cancel' ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>

    <!-- Grille transfert -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-slate-900">Grille transfert (€/km)</h2>

      <!-- Liste -->
      <div v-for="b in transferBands" :key="(b as Record<string, unknown>).id as string" class="rounded-lg border border-slate-200 p-3">
        <div v-if="editingBand === (b.id as string)" class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Nom</label>
              <input v-model="editBandForm.name" type="text" class="field" />
            </div>
            <div>
              <label class="label">Prix €/km</label>
              <input v-model="editBandForm.pricePerKmEuros" type="number" step="0.01" min="0.01" class="field" />
            </div>
            <div>
              <label class="label">Début</label>
              <input v-model="editBandForm.startTime" type="time" class="field" />
            </div>
            <div>
              <label class="label">Fin</label>
              <input v-model="editBandForm.endTime" type="time" class="field" />
            </div>
          </div>
          <div>
            <label class="label">Jours (vide = tous)</label>
            <div class="flex flex-wrap gap-1 mt-1">
              <label v-for="(d, i) in DAY_NAMES" :key="i" class="flex items-center gap-1 text-xs cursor-pointer">
                <input v-model="editBandForm.daysOfWeek" type="checkbox" :value="i" class="rounded" />
                {{ d }}
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Priorité</label>
              <input v-model.number="editBandForm.priority" type="number" min="0" class="field" />
            </div>
            <div class="flex items-end pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input v-model="editBandForm.isDefault" type="checkbox" />
                Bande par défaut
              </label>
            </div>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-primary" :disabled="saving === `band-edit-${b.id}`" @click="updateBand(b.id as string)">
              {{ saving === `band-edit-${b.id}` ? '…' : 'Enregistrer' }}
            </button>
            <button type="button" class="btn-ghost" @click="editingBand = null">Annuler</button>
          </div>
        </div>

        <div v-else class="flex items-center justify-between">
          <div>
            <p class="font-medium text-slate-800">{{ b.name }}</p>
            <p class="text-xs text-slate-500">
              {{ (b.daysOfWeek as number[]).length ? (b.daysOfWeek as number[]).map((d: number) => DAY_NAMES[d]).join(', ') : 'Tous les jours' }}
              · {{ minuteToTime(b.startMinute as number) }}–{{ minuteToTime(b.endMinute as number) }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-semibold text-slate-900">{{ formatMoney(b.pricePerKmCents as number, currency) }}/km</span>
            <button type="button" class="text-xs text-brand-700 hover:underline" @click="startEditBand(b)">Modifier</button>
            <button type="button" class="text-xs text-red-600 hover:underline" @click="deleteBand(b.id as string)">Supprimer</button>
          </div>
        </div>
      </div>

      <!-- Ajouter une bande -->
      <details class="rounded-lg border border-dashed border-slate-300">
        <summary class="cursor-pointer px-3 py-2 text-sm text-slate-600 hover:text-slate-900">+ Ajouter une bande</summary>
        <div class="space-y-3 p-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Nom</label>
              <input v-model="newBand.name" type="text" class="field" placeholder="Pointe matin" />
            </div>
            <div>
              <label class="label">Prix €/km</label>
              <input v-model="newBand.pricePerKmEuros" type="number" step="0.01" min="0.01" class="field" placeholder="2.50" />
            </div>
            <div>
              <label class="label">Début</label>
              <input v-model="newBand.startTime" type="time" class="field" />
            </div>
            <div>
              <label class="label">Fin</label>
              <input v-model="newBand.endTime" type="time" class="field" />
            </div>
          </div>
          <div>
            <label class="label">Jours (vide = tous)</label>
            <div class="flex flex-wrap gap-1 mt-1">
              <label v-for="(d, i) in DAY_NAMES" :key="i" class="flex items-center gap-1 text-xs cursor-pointer">
                <input v-model="newBand.daysOfWeek" type="checkbox" :value="i" class="rounded" />
                {{ d }}
              </label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Priorité</label>
              <input v-model.number="newBand.priority" type="number" min="0" class="field" />
            </div>
            <div class="flex items-end pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input v-model="newBand.isDefault" type="checkbox" />
                Bande par défaut
              </label>
            </div>
          </div>
          <button type="button" class="btn-primary" :disabled="saving === 'band-add' || !newBand.name || !newBand.pricePerKmEuros" @click="addBand">
            {{ saving === 'band-add' ? '…' : 'Ajouter' }}
          </button>
        </div>
      </details>
    </div>

    <!-- Grille mise à disposition -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-slate-900">Grille mise à disposition (€/h)</h2>

      <!-- Liste -->
      <div v-for="t in hourlyTiers" :key="(t as Record<string, unknown>).id as string" class="rounded-lg border border-slate-200 p-3">
        <div v-if="editingTier === (t.id as string)" class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">À partir de (h)</label>
              <input v-model.number="editTierForm.minHours" type="number" min="1" max="24" class="field" />
            </div>
            <div>
              <label class="label">Prix €/h</label>
              <input v-model="editTierForm.pricePerHourEuros" type="number" step="0.01" min="0.01" class="field" />
            </div>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-primary" :disabled="saving === `tier-edit-${t.id}`" @click="updateTier(t.id as string)">
              {{ saving === `tier-edit-${t.id}` ? '…' : 'Enregistrer' }}
            </button>
            <button type="button" class="btn-ghost" @click="editingTier = null">Annuler</button>
          </div>
        </div>

        <div v-else class="flex items-center justify-between">
          <p class="font-medium text-slate-800">À partir de {{ t.minHours }}h</p>
          <div class="flex items-center gap-3">
            <span class="font-semibold text-slate-900">{{ formatMoney(t.pricePerHourCents as number, currency) }}/h</span>
            <button type="button" class="text-xs text-brand-700 hover:underline" @click="startEditTier(t)">Modifier</button>
            <button type="button" class="text-xs text-red-600 hover:underline" @click="deleteTier(t.id as string)">Supprimer</button>
          </div>
        </div>
      </div>

      <!-- Ajouter un palier -->
      <details class="rounded-lg border border-dashed border-slate-300">
        <summary class="cursor-pointer px-3 py-2 text-sm text-slate-600 hover:text-slate-900">+ Ajouter un palier</summary>
        <div class="grid grid-cols-2 gap-2 p-3">
          <div>
            <label class="label">À partir de (h)</label>
            <input v-model.number="newTier.minHours" type="number" min="1" max="24" class="field" />
          </div>
          <div>
            <label class="label">Prix €/h</label>
            <input v-model="newTier.pricePerHourEuros" type="number" step="0.01" min="0.01" class="field" placeholder="55.00" />
          </div>
          <div class="col-span-2">
            <button type="button" class="btn-primary" :disabled="saving === 'tier-add' || !newTier.pricePerHourEuros" @click="addTier">
              {{ saving === 'tier-add' ? '…' : 'Ajouter' }}
            </button>
          </div>
        </div>
      </details>
    </div>
    <!-- Suppléments -->
    <div class="card space-y-4">
      <h2 class="font-semibold text-slate-900">Suppléments</h2>
      <p class="text-xs text-slate-500">Frais additionnels applicables à une course (ex. bagage, animal, nuit…). Les suppléments "auto" sont inclus dans tous les devis.</p>

      <div v-for="s in surcharges" :key="(s as Record<string, unknown>).id as string" class="rounded-lg border border-slate-200 p-3">
        <div v-if="editingSurcharge === (s.id as string)" class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Nom</label>
              <input v-model="editSurchargeForm.name" type="text" class="field" />
            </div>
            <div>
              <label class="label">Type</label>
              <select v-model="editSurchargeForm.kind" class="field">
                <option value="FIXED">Fixe (€)</option>
                <option value="PERCENT">Pourcentage (%)</option>
              </select>
            </div>
            <div>
              <label class="label">{{ editSurchargeForm.kind === 'PERCENT' ? 'Pourcentage (%)' : 'Montant (€)' }}</label>
              <input v-model="editSurchargeForm.amountDisplay" type="number" step="0.01" min="0.01" class="field" />
            </div>
            <div class="flex items-end pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input v-model="editSurchargeForm.autoApply" type="checkbox" />
                Appliquer automatiquement
              </label>
            </div>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-primary" :disabled="saving === `surcharge-edit-${s.id}`" @click="updateSurcharge(s.id as string)">
              {{ saving === `surcharge-edit-${s.id}` ? '…' : 'Enregistrer' }}
            </button>
            <button type="button" class="btn-ghost" @click="editingSurcharge = null">Annuler</button>
          </div>
        </div>

        <div v-else class="flex items-center justify-between">
          <div>
            <p class="font-medium text-slate-800">{{ s.name }}</p>
            <p class="text-xs text-slate-500">{{ (s.autoApply as boolean) ? 'Auto' : 'Manuel' }}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-semibold text-slate-900">{{ surchargeAmount(s) }}</span>
            <button type="button" class="text-xs text-brand-700 hover:underline" @click="startEditSurcharge(s)">Modifier</button>
            <button type="button" class="text-xs text-red-600 hover:underline" @click="deleteSurcharge(s.id as string)">Supprimer</button>
          </div>
        </div>
      </div>

      <details class="rounded-lg border border-dashed border-slate-300">
        <summary class="cursor-pointer px-3 py-2 text-sm text-slate-600 hover:text-slate-900">+ Ajouter un supplément</summary>
        <div class="space-y-3 p-3">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Nom</label>
              <input v-model="newSurcharge.name" type="text" class="field" placeholder="Bagage supplémentaire" />
            </div>
            <div>
              <label class="label">Type</label>
              <select v-model="newSurcharge.kind" class="field">
                <option value="FIXED">Fixe (€)</option>
                <option value="PERCENT">Pourcentage (%)</option>
              </select>
            </div>
            <div>
              <label class="label">{{ newSurcharge.kind === 'PERCENT' ? 'Pourcentage (%)' : 'Montant (€)' }}</label>
              <input v-model="newSurcharge.amountDisplay" type="number" step="0.01" min="0.01" class="field" placeholder="10.00" />
            </div>
            <div class="flex items-end pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input v-model="newSurcharge.autoApply" type="checkbox" />
                Appliquer automatiquement
              </label>
            </div>
          </div>
          <button type="button" class="btn-primary" :disabled="saving === 'surcharge-add' || !newSurcharge.name || !newSurcharge.amountDisplay" @click="addSurcharge">
            {{ saving === 'surcharge-add' ? '…' : 'Ajouter' }}
          </button>
        </div>
      </details>
    </div>
  </div>
</template>
