<script setup lang="ts">
import {
  ONSITE_METHODS,
  PAYMENT_METHOD_SHORT_LABELS,
  type PaymentMethod,
} from '~/lib/payment-methods'
import { onlinePaymentPolicy, onSitePaymentMethods } from '~/lib/booking-policy'
import {
  priceTransfer,
  priceHourly,
  type TransferRateBandInput,
  type HourlyRateTierInput,
  type SurchargeInput,
  type PriceResult,
} from '~/lib/pricing'

definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Réglages' })
const { formatMoney } = useFormat()

const { data: me, refresh } = await useFetch('/api/dashboard/me', { lazy: true })
const connecting = ref(false)
const saving = ref<string | null>(null)
const errorMsg = ref('')
const successMsg = ref('')

// ─── Onglets (synchronisés avec l'URL pour être partageables) ───────────────

const tabs = [
  { key: 'tarifs', label: 'Mes tarifs' },
  { key: 'paiements', label: 'Paiement & réservations' },
  { key: 'general', label: 'Général' },
] as const
type TabKey = (typeof tabs)[number]['key']

const route = useRoute()
const router = useRouter()
const tab = computed<TabKey>(() => {
  const q = route.query.tab
  return tabs.some((t) => t.key === q) ? (q as TabKey) : 'tarifs'
})
function selectTab(key: TabKey) {
  router.replace({ query: key === 'tarifs' ? {} : { tab: key } })
}

// La barre d'onglets scrolle horizontalement sur mobile : sans cela, l'onglet
// actif (ex. « Général » via ?tab=general) peut rester entièrement hors écran.
const tabsBar = ref<HTMLElement | null>(null)
const activeTabEl = ref<HTMLElement | null>(null)
function revealActiveTab() {
  activeTabEl.value?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
}
onMounted(() => nextTick(revealActiveTab))
watch(tab, () => nextTick(revealActiveTab))

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

// Connexion par clé API : le chauffeur colle la clé générée dans son espace SumUp.
const sumupOauthEnabled = useRuntimeConfig().public.sumupOauthEnabled
const sumup = computed(() => (me.value as Record<string, unknown>)?.sumup as { connected?: boolean; viaApiKey?: boolean } | undefined)
const sumupApiKey = ref('')

async function saveSumupApiKey() {
  if (!sumupApiKey.value.trim()) return
  await call('sumup-api-key', () =>
    $fetch('/api/payments/sumup/api-key', { method: 'POST', body: { apiKey: sumupApiKey.value } }),
  )
  if (!errorMsg.value) sumupApiKey.value = ''
}

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

// ─── Telegram ──────────────────────────────────────────────────────────────

const telegramLinked = computed(() => Boolean((me.value as Record<string, unknown>)?.telegramLinked))
const telegramConnecting = ref(false)
const telegramDeepLink = ref('')
let telegramPoll: ReturnType<typeof setInterval> | null = null

function stopTelegramPoll() {
  if (telegramPoll) {
    clearInterval(telegramPoll)
    telegramPoll = null
  }
}

// Option A : après ouverture de Telegram, on interroge le serveur en boucle et la
// page bascule seule en « connecté » dès que le chauffeur a appuyé sur DÉMARRER.
function startTelegramPoll() {
  stopTelegramPoll()
  let elapsed = 0
  telegramPoll = setInterval(async () => {
    elapsed += 3
    try {
      const res = await $fetch<{ linked: boolean }>('/api/dashboard/telegram/status')
      if (res.linked) {
        stopTelegramPoll()
        telegramDeepLink.value = ''
        successMsg.value = 'Compte Telegram connecté ✅'
        await refresh()
      }
    } catch {
      // On retente au prochain tick.
    }
    if (elapsed >= 180) stopTelegramPoll() // abandon silencieux après 3 min
  }, 3000)
}

async function connectTelegram() {
  telegramConnecting.value = true
  errorMsg.value = ''
  successMsg.value = ''
  try {
    const res = await $fetch<{ deepLink: string; botUsername: string }>(
      '/api/dashboard/telegram/connect',
      { method: 'POST' },
    )
    telegramDeepLink.value = res.deepLink
    window.open(res.deepLink, '_blank') // ouvre l'app / le web Telegram
    startTelegramPoll()
  } catch (e) {
    errorMsg.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage
      ?? 'Connexion Telegram indisponible pour le moment.'
  } finally {
    telegramConnecting.value = false
  }
}

async function disconnectTelegram() {
  if (!confirm('Déconnecter Telegram ? Vous ne recevrez plus vos notifications sur Telegram.')) return
  stopTelegramPoll()
  telegramDeepLink.value = ''
  await call('telegram-disconnect', () => $fetch('/api/dashboard/telegram/disconnect', { method: 'POST' }))
}

onBeforeUnmount(stopTelegramPoll)

// ─── Réservations & paiement ───────────────────────────────────────────────

type PayChoice = 'ONLINE_REQUIRED' | 'CLIENT_CHOICE' | 'ONSITE_ONLY'

const payChoice = ref<PayChoice>('ONSITE_ONLY')
const onsiteMethods = ref<PaymentMethod[]>([])
const autoConfirm = ref(false)

watchEffect(() => {
  const d = me.value as Record<string, unknown> | null
  if (!d) return
  const methods = (d.paymentMethods as PaymentMethod[] | undefined) ?? []
  const policy = onlinePaymentPolicy(methods)
  payChoice.value =
    policy === 'REQUIRED' ? 'ONLINE_REQUIRED' : policy === 'OPTIONAL' ? 'CLIENT_CHOICE' : 'ONSITE_ONLY'
  onsiteMethods.value = onSitePaymentMethods(methods)
  if (typeof d.autoAcceptQuotes === 'boolean') autoConfirm.value = d.autoAcceptQuotes
})

const onlineReady = computed(() => {
  const d = me.value as Record<string, unknown> | null
  if (!d) return false
  if (d.paymentProvider === 'SUMUP') {
    return Boolean((d.sumup as Record<string, unknown> | undefined)?.connected)
  }
  const s = d.stripe as Record<string, unknown> | undefined
  return Boolean(s?.connected && s?.chargesEnabled)
})

watch(payChoice, (choice) => {
  if (choice !== 'ONLINE_REQUIRED' && onsiteMethods.value.length === 0) {
    onsiteMethods.value = ['ONSITE_CARD', 'ONSITE_CASH']
  }
})

function toggleOnsiteMethod(method: PaymentMethod) {
  const i = onsiteMethods.value.indexOf(method)
  if (i === -1) onsiteMethods.value.push(method)
  else onsiteMethods.value.splice(i, 1)
}

const needsOnsite = computed(() => payChoice.value !== 'ONLINE_REQUIRED')
const onsiteMissing = computed(() => needsOnsite.value && onsiteMethods.value.length === 0)

const recap = computed(() => {
  const auto = autoConfirm.value
  switch (payChoice.value) {
    case 'ONLINE_REQUIRED':
      return auto
        ? 'Le client réserve et paie en ligne → course confirmée aussitôt, sans action de votre part.'
        : 'Le client fait sa demande → vous validez le devis → il paie en ligne → course confirmée.'
    case 'CLIENT_CHOICE':
      return auto
        ? 'Le client réserve en payant en ligne, ou en choisissant le règlement sur place → course confirmée aussitôt si le créneau est libre.'
        : 'Le client fait sa demande → vous validez → il confirme en payant en ligne ou en réservant avec règlement sur place.'
    default:
      return auto
        ? 'Le client réserve → course confirmée aussitôt si le créneau est libre → règlement sur place le jour J.'
        : 'Le client fait sa demande → vous acceptez → course confirmée → règlement sur place le jour J.'
  }
})

async function saveBookingSettings() {
  const methods: PaymentMethod[] =
    payChoice.value === 'ONLINE_REQUIRED'
      ? ['STRIPE_PREPAYMENT']
      : [
          ...(payChoice.value === 'CLIENT_CHOICE' ? (['STRIPE_PREPAYMENT'] as PaymentMethod[]) : []),
          ...ONSITE_METHODS.filter((m) => onsiteMethods.value.includes(m)),
        ]
  await call('booking-settings', () =>
    $fetch('/api/dashboard/settings', {
      method: 'PATCH',
      body: { paymentMethods: methods, autoAcceptQuotes: autoConfirm.value },
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
        minLeadTimeMinutes: settings.minLeadTimeMinutes,
        quoteExpiryHours: settings.quoteExpiryHours,
        approachBufferMinutes: settings.approachBufferMinutes,
      },
    }),
  )
}

// Course minimum : réglage tarifaire, enregistré seul depuis l'onglet Tarifs.
async function saveMinimum() {
  await call('minimum', () =>
    $fetch('/api/dashboard/settings', {
      method: 'PATCH',
      body: { minimumFareCents: settings.minimumFareCents },
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

// ─── Données tarifaires ────────────────────────────────────────────────────

const transferBands = computed(() => (me.value as Record<string, unknown>)?.transferBands as Record<string, unknown>[] ?? [])
const hourlyTiers = computed(() => (me.value as Record<string, unknown>)?.hourlyTiers as Record<string, unknown>[] ?? [])
const currency = computed(() => ((me.value as Record<string, unknown>)?.currency as string) ?? 'eur')
const timezone = computed(() => ((me.value as Record<string, unknown>)?.timezone as string) ?? 'Europe/Paris')
const surcharges = computed(() => (me.value as Record<string, unknown>)?.surcharges as Record<string, unknown>[] ?? [])

// Tarif de secours d'abord, puis du plus prioritaire au moins prioritaire :
// l'ordre affiché raconte la règle de sélection.
const sortedBands = computed(() =>
  [...transferBands.value].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return (b.priority as number) - (a.priority as number)
  }),
)

const sortedTiers = computed(() =>
  [...hourlyTiers.value].sort((a, b) => (a.minHours as number) - (b.minHours as number)),
)

// « De 1 h à 3 h » / « 4 h et plus » — bien plus parlant que « à partir de ».
function tierRangeLabel(index: number): string {
  const tiers = sortedTiers.value
  const from = tiers[index]!.minHours as number
  const next = tiers[index + 1]?.minHours as number | undefined
  if (next == null) return `${from} h et plus`
  if (next - 1 <= from) return `${from} h`
  return `De ${from} h à ${next - 1} h`
}

// ─── Grilles transfert ────────────────────────────────────────────────────

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
// Ordre d'affichage lundi → dimanche (plus naturel), valeurs 0 = dimanche.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

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

// Résumé en français d'une bande : « Tous les jours · de 22h00 à 06h00 ».
function bandWhenLabel(b: Record<string, unknown>): string {
  const days = b.daysOfWeek as number[]
  const dayStr = days.length
    ? DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]).join(', ')
    : 'Tous les jours'
  const start = b.startMinute as number
  const end = b.endMinute as number
  const overnight = end > 1440
  return `${dayStr} · de ${minuteToTime(start)} à ${minuteToTime(end)}${overnight ? ' (le lendemain)' : ''}`
}

interface BandForm {
  name: string
  pricePerKmEuros: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
  priority: number
  isDefault: boolean
}

const newBand = reactive<BandForm>({
  name: '',
  pricePerKmEuros: '',
  startTime: '06:00',
  endTime: '22:00',
  daysOfWeek: [],
  priority: 0,
  isDefault: false,
})

const editingBand = ref<string | null>(null)
const editBandForm = reactive<BandForm>({ ...newBand, daysOfWeek: [] })

function toggleDay(form: BandForm, day: number) {
  const i = form.daysOfWeek.indexOf(day)
  if (i === -1) form.daysOfWeek.push(day)
  else form.daysOfWeek.splice(i, 1)
}

function startEditBand(b: Record<string, unknown>) {
  editingBand.value = b.id as string
  editBandForm.name = b.name as string
  editBandForm.pricePerKmEuros = ((b.pricePerKmCents as number) / 100).toFixed(2)
  editBandForm.startTime = minuteToInput(b.startMinute as number)
  editBandForm.endTime = minuteToInput((b.endMinute as number) % 1440)
  editBandForm.daysOfWeek = [...(b.daysOfWeek as number[])]
  editBandForm.priority = b.priority as number
  editBandForm.isDefault = b.isDefault as boolean
}

// Plage horaire → minutes, en gérant le passage de minuit (fin ≤ début = lendemain).
function bandMinutes(form: BandForm): { startMinute: number; endMinute: number } {
  const startMinute = timeToMinute(form.startTime)
  let endMinute = timeToMinute(form.endTime)
  if (endMinute <= startMinute) endMinute += 1440
  return { startMinute, endMinute }
}

async function addBand() {
  await call('band-add', async () => {
    await $fetch('/api/dashboard/rates/transfer', {
      method: 'POST',
      body: {
        name: newBand.name,
        pricePerKmCents: Math.round(parseFloat(newBand.pricePerKmEuros) * 100),
        ...bandMinutes(newBand),
        daysOfWeek: newBand.daysOfWeek,
        // Un nouveau tarif spécifique doit gagner sur les existants quand il
        // s'applique : priorité auto = max + 1 (ajustable dans « Avancé »).
        priority: newBand.priority ||
          Math.max(0, ...transferBands.value.map((b) => b.priority as number)) + 1,
        isDefault: newBand.isDefault,
      },
    })
    Object.assign(newBand, { name: '', pricePerKmEuros: '', startTime: '06:00', endTime: '22:00', daysOfWeek: [], priority: 0, isDefault: false })
    addingBand.value = false
  })
}

const addingBand = ref(false)

async function updateBand(id: string) {
  await call(`band-edit-${id}`, async () => {
    await $fetch(`/api/dashboard/rates/transfer/${id}`, {
      method: 'PATCH',
      body: {
        name: editBandForm.name,
        pricePerKmCents: Math.round(parseFloat(editBandForm.pricePerKmEuros) * 100),
        ...bandMinutes(editBandForm),
        daysOfWeek: editBandForm.daysOfWeek,
        priority: editBandForm.priority,
        isDefault: editBandForm.isDefault,
      },
    })
    editingBand.value = null
  })
}

async function deleteBand(id: string) {
  if (!confirm('Supprimer ce tarif ?')) return
  await call(`band-del-${id}`, () =>
    $fetch(`/api/dashboard/rates/transfer/${id}`, { method: 'DELETE' }),
  )
}

// ─── Grilles horaires ─────────────────────────────────────────────────────

const newTier = reactive({ minHours: 1, pricePerHourEuros: '' })
const addingTier = ref(false)
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
    addingTier.value = false
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

// ─── Suppléments ──────────────────────────────────────────────────────────

const newSurcharge = reactive({ name: '', kind: 'FIXED' as 'FIXED' | 'PERCENT', amountDisplay: '', autoApply: false })
const addingSurcharge = ref(false)
const editingSurcharge = ref<string | null>(null)
const editSurchargeForm = reactive({ name: '', kind: 'FIXED' as 'FIXED' | 'PERCENT', amountDisplay: '', autoApply: false })

function surchargeAmount(s: Record<string, unknown>): string {
  if (s.kind === 'PERCENT') return `+ ${((s.amount as number) / 100).toFixed(1).replace('.0', '')} %`
  return `+ ${formatMoney(s.amount as number, currency.value)}`
}

function startEditSurcharge(s: Record<string, unknown>) {
  editingSurcharge.value = s.id as string
  editSurchargeForm.name = s.name as string
  editSurchargeForm.kind = s.kind as 'FIXED' | 'PERCENT'
  editSurchargeForm.amountDisplay = ((s.amount as number) / 100).toFixed(s.kind === 'PERCENT' ? 1 : 2)
  editSurchargeForm.autoApply = s.autoApply as boolean
}

function parseSurchargeAmount(display: string): number {
  return Math.round(parseFloat(display) * 100)
}

async function addSurcharge() {
  await call('surcharge-add', async () => {
    await $fetch('/api/dashboard/surcharges', {
      method: 'POST',
      body: {
        name: newSurcharge.name,
        kind: newSurcharge.kind,
        amount: parseSurchargeAmount(newSurcharge.amountDisplay),
        autoApply: newSurcharge.autoApply,
      },
    })
    Object.assign(newSurcharge, { name: '', amountDisplay: '', autoApply: false })
    addingSurcharge.value = false
  })
}

async function updateSurcharge(id: string) {
  await call(`surcharge-edit-${id}`, async () => {
    await $fetch(`/api/dashboard/surcharges/${id}`, {
      method: 'PATCH',
      body: {
        name: editSurchargeForm.name,
        kind: editSurchargeForm.kind,
        amount: parseSurchargeAmount(editSurchargeForm.amountDisplay),
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

// ─── Simulateur : vos tarifs appliqués par le vrai moteur de prix ──────────

function defaultSimDate(): string {
  const d = new Date(Date.now() + 3 * 3600_000)
  d.setMinutes(0, 0, 0)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

const sim = reactive({
  type: 'TRANSFER' as 'TRANSFER' | 'HOURLY',
  km: 15,
  roundTrip: false,
  when: defaultSimDate(),
  hours: 3,
})

const simResult = computed<{ result?: PriceResult; error?: string } | null>(() => {
  if (!me.value) return null
  const params = {
    currency: currency.value,
    minimumFareCents: settings.minimumFareCents,
    timezone: timezone.value,
  }
  const autoSurcharges: SurchargeInput[] = surcharges.value
    .filter((s) => s.autoApply as boolean)
    .map((s) => ({ name: s.name as string, kind: s.kind as 'FIXED' | 'PERCENT', amount: s.amount as number }))
  try {
    if (sim.type === 'TRANSFER') {
      if (!sim.km || sim.km <= 0) return null
      const bands: TransferRateBandInput[] = transferBands.value.map((b) => ({
        name: b.name as string,
        pricePerKmCents: b.pricePerKmCents as number,
        daysOfWeek: b.daysOfWeek as number[],
        startMinute: b.startMinute as number,
        endMinute: b.endMinute as number,
        priority: b.priority as number,
        isDefault: b.isDefault as boolean,
      }))
      const result = priceTransfer({
        distanceMeters: sim.km * 1000,
        scheduledAt: new Date(sim.when),
        roundTrip: sim.roundTrip,
        bands,
        surcharges: autoSurcharges,
        params,
      })
      return { result }
    }
    if (!sim.hours || sim.hours <= 0) return null
    const tiers: HourlyRateTierInput[] = hourlyTiers.value.map((t) => ({
      minHours: t.minHours as number,
      pricePerHourCents: t.pricePerHourCents as number,
    }))
    const result = priceHourly({ durationHours: sim.hours, tiers, surcharges: autoSurcharges, params })
    return { result }
  } catch (e) {
    return { error: (e as Error).message }
  }
})

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
</script>

<template>
  <div class="max-w-2xl">
    <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Réglages</h1>

    <!-- Onglets : l'onglet actif est toujours ramené dans le viewport (barre scrollable). -->
    <div ref="tabsBar" class="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      <button
        v-for="t in tabs"
        :key="t.key"
        :ref="(el) => { if (tab === t.key) activeTabEl = el as HTMLElement }"
        class="-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors"
        :class="tab === t.key
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'"
        @click="selectTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <p v-if="!me" class="mt-4 text-sm text-slate-400">Chargement…</p>

    <!-- Notifications globales -->
    <div class="sticky top-2 z-20 mt-4 space-y-2 empty:hidden">
      <p v-if="successMsg" class="rounded-xl bg-green-100 px-4 py-3 text-sm font-medium text-green-800 shadow-sm">✓ {{ successMsg }}</p>
      <p v-if="errorMsg" class="rounded-xl bg-red-100 px-4 py-3 text-sm font-medium text-red-700 shadow-sm">{{ errorMsg }}</p>
    </div>

    <!-- ═══════════════════ Onglet Tarifs ═══════════════════ -->
    <div v-if="tab === 'tarifs' && me" class="mt-5 space-y-5">
      <!-- Simulateur -->
      <div class="card !border-brand-200 !bg-brand-50/60">
        <h2 class="font-semibold text-slate-900">🧮 Testez vos tarifs</h2>
        <p class="mt-1 text-sm text-slate-600">
          Le prix exact qu'obtiendrait un client, calculé avec vos réglages ci-dessous.
        </p>

        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
            :class="sim.type === 'TRANSFER' ? 'border-brand-600 bg-white text-brand-700' : 'border-slate-300 text-slate-600'"
            @click="sim.type = 'TRANSFER'"
          >
            Transfert
          </button>
          <button
            type="button"
            class="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
            :class="sim.type === 'HOURLY' ? 'border-brand-600 bg-white text-brand-700' : 'border-slate-300 text-slate-600'"
            @click="sim.type = 'HOURLY'"
          >
            Mise à disposition
          </button>
        </div>

        <!-- Le champ date+heure prend toute la largeur sur mobile : en demi-colonne,
             l'heure du départ (déterminante pour le tarif) était coupée. -->
        <div v-if="sim.type === 'TRANSFER'" class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="sim-km">Distance (km)</label>
            <input id="sim-km" v-model.number="sim.km" type="number" min="1" step="1" class="field !bg-white" />
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="label" for="sim-when">Départ le</label>
            <input id="sim-when" v-model="sim.when" type="datetime-local" class="field !bg-white" />
          </div>
          <label class="col-span-2 flex items-center gap-2.5 py-1 text-sm text-slate-700">
            <input v-model="sim.roundTrip" type="checkbox" class="h-5 w-5 shrink-0 rounded border-slate-300" />
            Aller-retour
          </label>
        </div>
        <div v-else class="mt-3">
          <label class="label" for="sim-hours">Durée (heures)</label>
          <input id="sim-hours" v-model.number="sim.hours" type="number" min="1" max="24" class="field !bg-white sm:max-w-[180px]" />
        </div>

        <div v-if="simResult?.result" class="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div class="flex items-baseline justify-between">
            <span class="text-sm text-slate-600">Le client paierait</span>
            <span class="font-serif text-3xl font-medium text-slate-950">{{ formatMoney(simResult.result.amountCents, currency) }}</span>
          </div>
          <ul class="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
            <li v-for="(line, i) in simResult.result.breakdown" :key="i" class="flex justify-between gap-3">
              <span>{{ line.label }}<span v-if="line.detail"> — {{ line.detail }}</span></span>
              <span class="shrink-0">{{ formatMoney(line.amountCents, currency) }}</span>
            </li>
          </ul>
        </div>
        <p v-else-if="simResult?.error" class="mt-4 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900">
          ⚠️ {{ simResult.error }}
        </p>
      </div>

      <!-- Transfert (au km) -->
      <div class="card space-y-3">
        <div>
          <h2 class="font-semibold text-slate-900">Transfert — prix au km</h2>
          <p class="mt-1 text-sm text-slate-600">
            Prix d'un trajet = distance × votre prix au km, selon le moment du départ.
            Quand plusieurs tarifs correspondent, le plus haut dans la liste gagne.
          </p>
        </div>

        <div
          v-for="b in sortedBands"
          :key="(b as Record<string, unknown>).id as string"
          class="rounded-xl border p-4"
          :class="b.isDefault ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200'"
        >
          <!-- Édition -->
          <div v-if="editingBand === (b.id as string)" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Nom du tarif</label>
                <input v-model="editBandForm.name" type="text" class="field" placeholder="Nuit, Week-end…" />
              </div>
              <div>
                <label class="label">Prix au km (€)</label>
                <input v-model="editBandForm.pricePerKmEuros" type="number" step="0.01" min="0.01" class="field" />
              </div>
              <div>
                <label class="label">De</label>
                <input v-model="editBandForm.startTime" type="time" class="field !px-2.5" />
              </div>
              <div>
                <label class="label">À</label>
                <input v-model="editBandForm.endTime" type="time" class="field !px-2.5" />
                <p class="mt-1 text-xs text-slate-400">Avant « De » = le lendemain.</p>
              </div>
            </div>
            <div>
              <label class="label">Jours concernés <span class="font-normal text-slate-400">(aucun = tous)</span></label>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="d in DAY_ORDER"
                  :key="d"
                  type="button"
                  class="rounded-full border px-3.5 py-2.5 text-xs font-semibold transition-colors"
                  :class="editBandForm.daysOfWeek.includes(d)
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'"
                  @click="toggleDay(editBandForm, d)"
                >
                  {{ DAY_NAMES[d] }}
                </button>
              </div>
            </div>
            <details class="text-sm">
              <summary class="cursor-pointer py-2 text-xs font-medium text-slate-500">Réglages avancés</summary>
              <div class="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Priorité <span class="font-normal text-slate-400">(la + haute gagne)</span></label>
                  <input v-model.number="editBandForm.priority" type="number" min="0" class="field" />
                </div>
                <label class="flex items-end gap-2.5 pb-3 text-sm text-slate-600">
                  <input v-model="editBandForm.isDefault" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
                  Tarif de secours
                </label>
              </div>
            </details>
            <div class="flex gap-2">
              <button type="button" class="btn-primary !py-2.5 text-sm" :disabled="saving === `band-edit-${b.id}`" @click="updateBand(b.id as string)">
                {{ saving === `band-edit-${b.id}` ? '…' : 'Enregistrer' }}
              </button>
              <button type="button" class="btn-ghost !py-2.5 text-sm" @click="editingBand = null">Annuler</button>
            </div>
          </div>

          <!-- Lecture -->
          <div v-else class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                {{ b.name }}
                <span v-if="b.isDefault" class="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
                  Tarif de secours
                </span>
              </p>
              <p class="mt-0.5 text-xs text-slate-500">{{ bandWhenLabel(b) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="font-serif text-lg font-medium text-slate-950">{{ formatMoney(b.pricePerKmCents as number, currency) }}<span class="text-xs font-sans text-slate-500">/km</span></p>
              <p class="-mr-2.5 mt-0.5 flex justify-end gap-1 text-xs">
                <button type="button" class="rounded-lg px-2.5 py-2 font-semibold text-brand-700 hover:bg-brand-50" @click="startEditBand(b)">Modifier</button>
                <button type="button" class="rounded-lg px-2.5 py-2 font-semibold text-red-600 hover:bg-red-50" @click="deleteBand(b.id as string)">Supprimer</button>
              </p>
            </div>
          </div>
        </div>

        <!-- Ajout -->
        <div v-if="addingBand" class="rounded-xl border border-dashed border-brand-300 p-4">
          <p class="mb-3 text-sm font-semibold text-slate-900">Nouveau tarif</p>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Nom du tarif</label>
                <input v-model="newBand.name" type="text" class="field" placeholder="Nuit, Week-end…" />
              </div>
              <div>
                <label class="label">Prix au km (€)</label>
                <input v-model="newBand.pricePerKmEuros" type="number" step="0.01" min="0.01" class="field" placeholder="2,50" />
              </div>
              <div>
                <label class="label">De</label>
                <input v-model="newBand.startTime" type="time" class="field !px-2.5" />
              </div>
              <div>
                <label class="label">À</label>
                <input v-model="newBand.endTime" type="time" class="field !px-2.5" />
                <p class="mt-1 text-xs text-slate-400">Avant « De » = le lendemain.</p>
              </div>
            </div>
            <div>
              <label class="label">Jours concernés <span class="font-normal text-slate-400">(aucun = tous)</span></label>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  v-for="d in DAY_ORDER"
                  :key="d"
                  type="button"
                  class="rounded-full border px-3.5 py-2.5 text-xs font-semibold transition-colors"
                  :class="newBand.daysOfWeek.includes(d)
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'"
                  @click="toggleDay(newBand, d)"
                >
                  {{ DAY_NAMES[d] }}
                </button>
              </div>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-primary whitespace-nowrap !py-2.5 text-sm" :disabled="saving === 'band-add' || !newBand.name || !newBand.pricePerKmEuros" @click="addBand">
                {{ saving === 'band-add' ? '…' : 'Ajouter' }}
              </button>
              <button type="button" class="btn-ghost !py-2.5 text-sm" @click="addingBand = false">Annuler</button>
            </div>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-700"
          @click="addingBand = true"
        >
          ＋ Ajouter un tarif (nuit, week-end, heures de pointe…)
        </button>
      </div>

      <!-- Mise à disposition -->
      <div class="card space-y-3">
        <div>
          <h2 class="font-semibold text-slate-900">Mise à disposition — prix à l'heure</h2>
          <p class="mt-1 text-sm text-slate-600">
            Un prix par heure, dégressif selon la durée réservée.
          </p>
        </div>

        <div v-for="(t, i) in sortedTiers" :key="(t as Record<string, unknown>).id as string" class="rounded-xl border border-slate-200 p-4">
          <div v-if="editingTier === (t.id as string)" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">À partir de (heures)</label>
                <input v-model.number="editTierForm.minHours" type="number" min="1" max="24" class="field" />
              </div>
              <div>
                <label class="label">Prix par heure (€)</label>
                <input v-model="editTierForm.pricePerHourEuros" type="number" step="0.01" min="0.01" class="field" />
              </div>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-primary !py-2.5 text-sm" :disabled="saving === `tier-edit-${t.id}`" @click="updateTier(t.id as string)">
                {{ saving === `tier-edit-${t.id}` ? '…' : 'Enregistrer' }}
              </button>
              <button type="button" class="btn-ghost !py-2.5 text-sm" @click="editingTier = null">Annuler</button>
            </div>
          </div>

          <div v-else class="flex items-center justify-between gap-3">
            <p class="font-semibold text-slate-900">{{ tierRangeLabel(i) }}</p>
            <div class="shrink-0 text-right">
              <p class="font-serif text-lg font-medium text-slate-950">{{ formatMoney(t.pricePerHourCents as number, currency) }}<span class="font-sans text-xs text-slate-500">/h</span></p>
              <p class="-mr-2.5 mt-0.5 flex justify-end gap-1 text-xs">
                <button type="button" class="rounded-lg px-2.5 py-2 font-semibold text-brand-700 hover:bg-brand-50" @click="startEditTier(t)">Modifier</button>
                <button type="button" class="rounded-lg px-2.5 py-2 font-semibold text-red-600 hover:bg-red-50" @click="deleteTier(t.id as string)">Supprimer</button>
              </p>
            </div>
          </div>
        </div>

        <div v-if="addingTier" class="rounded-xl border border-dashed border-brand-300 p-4">
          <p class="mb-3 text-sm font-semibold text-slate-900">Nouveau palier</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">À partir de (heures)</label>
              <input v-model.number="newTier.minHours" type="number" min="1" max="24" class="field" />
            </div>
            <div>
              <label class="label">Prix par heure (€)</label>
              <input v-model="newTier.pricePerHourEuros" type="number" step="0.01" min="0.01" class="field" placeholder="55,00" />
            </div>
          </div>
          <div class="mt-3 flex gap-2">
            <button type="button" class="btn-primary whitespace-nowrap !py-2.5 text-sm" :disabled="saving === 'tier-add' || !newTier.pricePerHourEuros" @click="addTier">
              {{ saving === 'tier-add' ? '…' : 'Ajouter' }}
            </button>
            <button type="button" class="btn-ghost !py-2.5 text-sm" @click="addingTier = false">Annuler</button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-700"
          @click="addingTier = true"
        >
          ＋ Ajouter un palier dégressif
        </button>
      </div>

      <!-- Course minimum -->
      <form class="card" @submit.prevent="saveMinimum">
        <h2 class="font-semibold text-slate-900">Course minimum</h2>
        <p class="mt-1 text-sm text-slate-600">
          Aucun devis ne descendra sous ce montant : si le calcul donne moins, le prix est
          remonté automatiquement.
        </p>
        <div class="mt-3 flex items-end gap-3">
          <div class="w-36">
            <label class="label" for="minFare">Montant (€)</label>
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
          <button type="submit" class="btn-primary !py-3 text-sm" :disabled="saving === 'minimum'">
            {{ saving === 'minimum' ? '…' : 'Enregistrer' }}
          </button>
        </div>
      </form>

      <!-- Suppléments -->
      <div class="card space-y-3">
        <div>
          <h2 class="font-semibold text-slate-900">Suppléments</h2>
          <p class="mt-1 text-sm text-slate-600">
            Frais additionnels (bagage, animal, siège bébé…). Ceux marqués « dans chaque devis »
            s'ajoutent automatiquement à tous les prix.
          </p>
        </div>

        <div v-for="s in surcharges" :key="(s as Record<string, unknown>).id as string" class="rounded-xl border border-slate-200 p-4">
          <div v-if="editingSurcharge === (s.id as string)" class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="label">Nom</label>
                <input v-model="editSurchargeForm.name" type="text" class="field" />
              </div>
              <div>
                <label class="label">{{ editSurchargeForm.kind === 'PERCENT' ? 'Majoration (%)' : 'Montant (€)' }}</label>
                <div class="flex gap-2">
                  <input v-model="editSurchargeForm.amountDisplay" type="number" step="0.01" min="0.01" class="field" />
                  <select v-model="editSurchargeForm.kind" class="field !w-20 !px-2">
                    <option value="FIXED">€</option>
                    <option value="PERCENT">%</option>
                  </select>
                </div>
              </div>
            </div>
            <label class="flex items-center gap-2.5 py-1 text-sm text-slate-600">
              <input v-model="editSurchargeForm.autoApply" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
              Inclure automatiquement dans chaque devis
            </label>
            <div class="flex gap-2">
              <button type="button" class="btn-primary !py-2.5 text-sm" :disabled="saving === `surcharge-edit-${s.id}`" @click="updateSurcharge(s.id as string)">
                {{ saving === `surcharge-edit-${s.id}` ? '…' : 'Enregistrer' }}
              </button>
              <button type="button" class="btn-ghost !py-2.5 text-sm" @click="editingSurcharge = null">Annuler</button>
            </div>
          </div>

          <div v-else class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold text-slate-900">{{ s.name }}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ (s.autoApply as boolean) ? 'Inclus dans chaque devis' : 'À ajouter à la demande' }}
              </p>
            </div>
            <div class="shrink-0 text-right">
              <p class="font-serif text-lg font-medium text-slate-950">{{ surchargeAmount(s) }}</p>
              <p class="-mr-2.5 mt-0.5 flex justify-end gap-1 text-xs">
                <button type="button" class="rounded-lg px-2.5 py-2 font-semibold text-brand-700 hover:bg-brand-50" @click="startEditSurcharge(s)">Modifier</button>
                <button type="button" class="rounded-lg px-2.5 py-2 font-semibold text-red-600 hover:bg-red-50" @click="deleteSurcharge(s.id as string)">Supprimer</button>
              </p>
            </div>
          </div>
        </div>

        <div v-if="addingSurcharge" class="rounded-xl border border-dashed border-brand-300 p-4">
          <p class="mb-3 text-sm font-semibold text-slate-900">Nouveau supplément</p>
          <div class="space-y-3">
            <!-- Nom en pleine largeur sur mobile : en demi-colonne, montant et
                 placeholders étaient tronqués. -->
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="label">Nom</label>
                <input v-model="newSurcharge.name" type="text" class="field" placeholder="Bagage volumineux" />
              </div>
              <div>
                <label class="label">{{ newSurcharge.kind === 'PERCENT' ? 'Majoration (%)' : 'Montant (€)' }}</label>
                <div class="flex gap-2">
                  <input v-model="newSurcharge.amountDisplay" type="number" step="0.01" min="0.01" class="field" placeholder="10,00" />
                  <select v-model="newSurcharge.kind" class="field !w-20 !px-2">
                    <option value="FIXED">€</option>
                    <option value="PERCENT">%</option>
                  </select>
                </div>
              </div>
            </div>
            <label class="flex items-center gap-2.5 py-1 text-sm text-slate-600">
              <input v-model="newSurcharge.autoApply" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
              Inclure automatiquement dans chaque devis
            </label>
            <div class="flex gap-2">
              <button type="button" class="btn-primary !py-2.5 text-sm" :disabled="saving === 'surcharge-add' || !newSurcharge.name || !newSurcharge.amountDisplay" @click="addSurcharge">
                {{ saving === 'surcharge-add' ? '…' : 'Ajouter' }}
              </button>
              <button type="button" class="btn-ghost !py-2.5 text-sm" @click="addingSurcharge = false">Annuler</button>
            </div>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="w-full rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:text-brand-700"
          @click="addingSurcharge = true"
        >
          ＋ Ajouter un supplément
        </button>
      </div>
    </div>

    <!-- ═══════════════════ Onglet Paiement & réservations ═══════════════════ -->
    <div v-else-if="tab === 'paiements' && me" class="mt-5 space-y-5">
      <!-- SumUp -->
      <div class="card">
        <h2 class="font-semibold text-slate-900">Paiement (SumUp)</h2>
        <p class="mt-1 text-sm text-slate-600">
          Reliez votre compte SumUp : les paiements en ligne de vos courses arrivent directement chez vous.
        </p>

        <div class="mt-3">
          <p v-if="sumup?.connected" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
            ✅ Compte SumUp connecté ({{ sumup?.viaApiKey ? 'clé API' : 'OAuth' }}) — encaissement actif
          </p>
          <p v-else class="text-sm text-slate-500">Aucun compte SumUp connecté.</p>
        </div>

        <form v-if="!sumup?.connected" class="mt-4 space-y-3" @submit.prevent="saveSumupApiKey">
          <div>
            <label class="label" for="sumup-api-key">Clé API SumUp</label>
            <input
              id="sumup-api-key"
              v-model="sumupApiKey"
              type="password"
              class="field"
              placeholder="sup_sk_…"
              autocomplete="off"
            />
          </div>
          <button class="btn-primary" :disabled="saving === 'sumup-api-key' || !sumupApiKey.trim()">
            {{ saving === 'sumup-api-key' ? 'Vérification auprès de SumUp…' : 'Enregistrer la clé' }}
          </button>
          <details class="text-sm text-slate-600">
            <summary class="cursor-pointer py-2 font-medium text-slate-700">Où trouver ma clé API SumUp ?</summary>
            <ol class="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Connectez-vous sur
                <a href="https://me.sumup.com" target="_blank" rel="noopener" class="text-brand-700 underline">me.sumup.com</a>
                depuis un ordinateur (pas l'application mobile).
              </li>
              <li>Ouvrez votre profil puis <strong>Paramètres</strong>.</li>
              <li>Descendez jusqu'à <strong>Pour les développeurs</strong> → <strong>Clés API</strong>.</li>
              <li>Cliquez sur <strong>Créer une clé API</strong> et donnez-lui un nom (par exemple « ma page de réservation »).</li>
              <li>Copiez la clé affichée (elle commence par <code>sup_sk_</code>) — elle n'est visible qu'une seule fois.</li>
              <li>Collez-la ci-dessus puis « Enregistrer la clé ».</li>
            </ol>
          </details>
        </form>

        <div v-if="sumupOauthEnabled || sumup?.connected" class="mt-4 flex gap-2">
          <button v-if="sumupOauthEnabled" class="btn-primary" :disabled="connecting" @click="connectSumup">
            {{ connecting ? '…' : sumup?.connected ? 'Reconnecter SumUp' : 'Connecter avec SumUp' }}
          </button>
          <button
            v-if="sumup?.connected"
            class="btn-ghost"
            :disabled="saving === 'sumup-disconnect'"
            @click="disconnectSumup"
          >
            Déconnecter
          </button>
        </div>
      </div>

      <!-- Notifications Telegram -->
      <div class="card">
        <h2 class="font-semibold text-slate-900">Notifications Telegram</h2>
        <p class="mt-1 text-sm text-slate-600">
          Recevez vos nouvelles demandes, paiements et rappels directement sur Telegram,
          et validez vos courses en un tap. L'email reste envoyé dans tous les cas.
        </p>

        <div class="mt-3">
          <p v-if="telegramLinked" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
            ✅ Compte Telegram connecté — notifications actives
          </p>
          <p v-else class="text-sm text-slate-500">Aucun compte Telegram connecté.</p>
        </div>

        <!-- Appairage en attente : lien de secours si l'ouverture auto a échoué -->
        <p v-if="telegramDeepLink && !telegramLinked" class="mt-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Dans Telegram, appuyez sur <strong>DÉMARRER</strong> dans la conversation du bot —
          cette page se mettra à jour automatiquement.<br />
          <a :href="telegramDeepLink" target="_blank" rel="noopener" class="font-medium underline">
            Ouvrir Telegram
          </a>
          si l'application ne s'est pas ouverte.
        </p>

        <div class="mt-4 flex gap-2">
          <button
            v-if="!telegramLinked"
            class="btn-primary"
            :disabled="telegramConnecting"
            @click="connectTelegram"
          >
            {{ telegramConnecting ? '…' : telegramDeepLink ? 'En attente de connexion…' : 'Connecter Telegram' }}
          </button>
          <button
            v-if="telegramLinked"
            class="btn-ghost"
            :disabled="saving === 'telegram-disconnect'"
            @click="disconnectTelegram"
          >
            Déconnecter
          </button>
        </div>

        <details v-if="!telegramLinked" class="mt-4 text-sm text-slate-600">
          <summary class="cursor-pointer py-2 font-medium text-slate-700">Comment ça marche ?</summary>
          <ol class="mt-2 list-decimal space-y-1 pl-5">
            <li>Installez <strong>Telegram</strong> sur votre téléphone (si ce n'est pas déjà fait).</li>
            <li>Cliquez sur <strong>Connecter Telegram</strong> : la conversation avec notre bot s'ouvre.</li>
            <li>Appuyez sur <strong>DÉMARRER</strong> dans Telegram.</li>
            <li>C'est lié : cette page passe en « connecté » toute seule.</li>
          </ol>
        </details>
      </div>

      <!-- Stripe (alternative — affiché si déjà utilisé) -->
      <div v-if="((me as Record<string, unknown>).stripe as Record<string, unknown>)?.connected" class="card">
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

      <!-- Réservations & paiement -->
      <form class="card space-y-5" @submit.prevent="saveBookingSettings">
        <div>
          <h2 class="font-semibold text-slate-900">Réservations & paiement</h2>
          <p class="mt-1 text-sm text-slate-600">
            Définissez comment vos clients réservent et règlent leurs courses.
          </p>
        </div>

        <fieldset>
          <legend class="text-sm font-semibold text-slate-800">1. Paiement des courses</legend>
          <div class="mt-2 space-y-2">
            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              :class="payChoice === 'ONLINE_REQUIRED' ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-brand-200'"
            >
              <input v-model="payChoice" type="radio" class="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" value="ONLINE_REQUIRED" name="pay-choice" />
              <span class="flex-1">
                <span class="text-sm font-medium text-slate-800">💳 En ligne, à la réservation</span>
                <span class="mt-1 block text-xs text-slate-500">
                  Le client règle par carte pour confirmer sa course. Zéro impayé, zéro no-show.
                </span>
                <span v-if="payChoice === 'ONLINE_REQUIRED' && !onlineReady" class="mt-1 block text-xs text-amber-600">
                  ⚠️ Connectez d'abord votre compte de paiement (SumUp) ci-dessus. En attendant,
                  vos demandes passeront en validation manuelle, sans lien de paiement.
                </span>
              </span>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              :class="payChoice === 'CLIENT_CHOICE' ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-brand-200'"
            >
              <input v-model="payChoice" type="radio" class="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" value="CLIENT_CHOICE" name="pay-choice" />
              <span class="flex-1">
                <span class="text-sm font-medium text-slate-800">🤝 Au choix du client : en ligne ou sur place</span>
                <span class="mt-1 block text-xs text-slate-500">
                  Le client prépaie par carte en ligne, ou règle le jour de la course.
                </span>
                <span v-if="payChoice === 'CLIENT_CHOICE' && !onlineReady" class="mt-1 block text-xs text-amber-600">
                  ⚠️ Connectez d'abord votre compte de paiement (SumUp) ci-dessus. En attendant,
                  seul le règlement sur place sera proposé à vos clients.
                </span>
              </span>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              :class="payChoice === 'ONSITE_ONLY' ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-brand-200'"
            >
              <input v-model="payChoice" type="radio" class="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" value="ONSITE_ONLY" name="pay-choice" />
              <span class="flex-1">
                <span class="text-sm font-medium text-slate-800">📍 Sur place uniquement</span>
                <span class="mt-1 block text-xs text-slate-500">
                  Le client règle le jour de la course. Aucun paiement en ligne proposé.
                </span>
              </span>
            </label>
          </div>

          <div v-if="needsOnsite" class="mt-3 rounded-lg bg-slate-50 p-3">
            <p class="text-xs font-medium text-slate-600">Moyens acceptés sur place</p>
            <div class="mt-2 flex flex-wrap gap-4">
              <label
                v-for="method in ONSITE_METHODS"
                :key="method"
                class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="h-5 w-5 shrink-0 rounded accent-brand-600"
                  :checked="onsiteMethods.includes(method)"
                  @change="toggleOnsiteMethod(method)"
                />
                {{ PAYMENT_METHOD_SHORT_LABELS[method] }}
              </label>
            </div>
            <p v-if="onsiteMissing" class="mt-2 text-xs text-red-600">
              Sélectionnez au moins un moyen d'encaissement sur place.
            </p>
          </div>
        </fieldset>

        <fieldset>
          <legend class="text-sm font-semibold text-slate-800">2. Confirmation des réservations</legend>
          <div class="mt-2 space-y-2">
            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              :class="autoConfirm === true ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-brand-200'"
            >
              <input v-model="autoConfirm" type="radio" class="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" :value="true" name="auto-confirm" />
              <span class="flex-1">
                <span class="text-sm font-medium text-slate-800">⚡ Automatique — si le créneau est libre</span>
                <span class="mt-1 block text-xs text-slate-500">
                  La course est confirmée dès la demande (et le paiement, si vous l'exigez), sans
                  action de votre part — vous êtes prévenu par email. En cas de conflit d'agenda,
                  la demande repasse en validation manuelle.
                </span>
              </span>
            </label>

            <label
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              :class="autoConfirm === false ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-brand-200'"
            >
              <input v-model="autoConfirm" type="radio" class="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" :value="false" name="auto-confirm" />
              <span class="flex-1">
                <span class="text-sm font-medium text-slate-800">✋ Je valide chaque demande</span>
                <span class="mt-1 block text-xs text-slate-500">
                  Rien n'est confirmé sans vous : vous acceptez, ajustez le prix ou refusez.
                  Le client est prévenu par email.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <div class="rounded-xl border border-brand-100 bg-brand-50 p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-brand-700">Votre parcours client</p>
          <p class="mt-1 text-sm text-brand-900">{{ recap }}</p>
        </div>

        <div class="flex justify-end">
          <button
            type="submit"
            class="btn-primary"
            :disabled="saving === 'booking-settings' || onsiteMissing"
          >
            {{ saving === 'booking-settings' ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
      </form>
    </div>

    <!-- ═══════════════════ Onglet Général ═══════════════════ -->
    <div v-else-if="tab === 'general' && me" class="mt-5 space-y-5">
      <!-- Page publique -->
      <div class="card">
        <h2 class="font-semibold text-slate-900">Ma page publique</h2>
        <p class="mt-1 text-sm text-slate-600">
          Accessible sur
          <NuxtLink :to="`/${(me as Record<string, unknown>).slug}`" class="font-medium text-brand-700 hover:underline">/{{ (me as Record<string, unknown>).slug }}</NuxtLink>
        </p>
      </div>

      <!-- Paramètres métier -->
      <form class="card space-y-4" @submit.prevent="saveSettings">
        <h2 class="font-semibold text-slate-900">Réservations</h2>
        <div class="grid gap-3 sm:grid-cols-2">
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
        <div class="grid gap-3 sm:grid-cols-2">
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
    </div>
  </div>
</template>
