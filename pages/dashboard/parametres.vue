<script setup lang="ts">
import {
  ONSITE_METHODS,
  PAYMENT_METHOD_SHORT_LABELS,
  type PaymentMethod,
} from '~/lib/payment-methods'
import { onlinePaymentPolicy, onSitePaymentMethods } from '~/lib/booking-policy'
import { reviewFunnelPath } from '~/lib/review-link'
import { parseTierRows, type TierRowForm } from '~/lib/tier-form'

definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Réglages' })
const { formatMoney } = useFormat()

const { data: me, refresh } = await useMe()
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

// ─── Fiche Google (lien d'avis) ────────────────────────────────────────────

interface GooglePlace {
  placeId: string
  name: string
  address: string
}

const googlePlace = computed(
  () => ((me.value as Record<string, unknown>)?.googlePlace as GooglePlace | null) ?? null,
)
// Lien « Tester » : ouvre la page de notation publique — exactement le parcours
// vécu par le client (5★ → dépôt public, note inférieure → retour privé).
const reviewTestPath = computed(() => {
  const slug = (me.value as Record<string, unknown>)?.slug as string | undefined
  return slug ? reviewFunnelPath(slug) : '#'
})
// Échappatoire : lien d'avis collé à la main (fiche introuvable, Trustpilot…).
const manualReviewUrl = computed(
  () => ((me.value as Record<string, unknown>)?.reviewUrl as string | null) ?? null,
)

const placeQuery = ref('')
const placeResults = ref<GooglePlace[] | null>(null) // null = pas encore cherché
const placeSearching = ref(false)

async function searchPlace() {
  if (placeQuery.value.trim().length < 2) return
  placeSearching.value = true
  errorMsg.value = ''
  try {
    const res = await $fetch<{ results: GooglePlace[] }>('/api/dashboard/google-place/search', {
      method: 'POST',
      body: { query: placeQuery.value },
    })
    placeResults.value = res.results
  } catch (e) {
    errorMsg.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage
      ?? 'Recherche impossible pour le moment.'
  } finally {
    placeSearching.value = false
  }
}

async function connectPlace(p: GooglePlace) {
  await call(`place-connect-${p.placeId}`, () =>
    $fetch('/api/dashboard/google-place/connect', { method: 'POST', body: { placeId: p.placeId } }),
  )
  if (!errorMsg.value) {
    placeQuery.value = ''
    placeResults.value = null
  }
}

async function disconnectPlace() {
  if (!confirm('Déconnecter votre fiche Google ? Le lien « laisser un avis » disparaîtra de vos messages automatiques.')) return
  await call('place-disconnect', () => $fetch('/api/dashboard/google-place/disconnect', { method: 'POST' }))
}

const manualUrlOpen = ref(false)
const manualUrlInput = ref('')

async function saveManualUrl() {
  if (!manualUrlInput.value.trim()) return
  await call('review-url', () =>
    $fetch('/api/dashboard/profile', {
      method: 'PATCH',
      body: { reviewUrl: manualUrlInput.value.trim() },
    }),
  )
  if (!errorMsg.value) {
    manualUrlOpen.value = false
    manualUrlInput.value = ''
  }
}

async function clearManualUrl() {
  if (!confirm('Retirer ce lien d’avis ? Il disparaîtra de vos messages automatiques.')) return
  await call('review-url-clear', () =>
    $fetch('/api/dashboard/profile', { method: 'PATCH', body: { reviewUrl: null } }),
  )
}

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
const currency = computed(() => ((me.value as Record<string, unknown>)?.currency as string) ?? 'eur')
const surcharges = computed(() => (me.value as Record<string, unknown>)?.surcharges as Record<string, unknown>[] ?? [])

// Tarif de secours d'abord, puis du plus prioritaire au moins prioritaire :
// l'ordre affiché raconte la règle de sélection.
const sortedBands = computed(() =>
  [...transferBands.value].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return (b.priority as number) - (a.priority as number)
  }),
)

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
  /** Grille dégressive selon la distance (sinon prix unique au km). */
  tiered: boolean
  tiers: TierRowForm[]
  startTime: string
  endTime: string
  daysOfWeek: number[]
  priority: number
  isDefault: boolean
}

const newBand = reactive<BandForm>({
  name: '',
  pricePerKmEuros: '',
  tiered: false,
  tiers: [],
  startTime: '06:00',
  endTime: '22:00',
  daysOfWeek: [],
  priority: 0,
  isDefault: false,
})

const editingBand = ref<string | null>(null)
const editBandForm = reactive<BandForm>({ ...newBand, daysOfWeek: [], tiers: [] })

/** Paliers d'une bande renvoyée par l'API (triés par position côté serveur). */
function bandTiers(b: Record<string, unknown>): { uptoKm: number | null; pricePerKmCents: number }[] {
  return (b.tiers as { uptoKm: number | null; pricePerKmCents: number }[] | undefined) ?? []
}

// Bascule prix unique ⇄ grille dégressive. La grille reste en mémoire pour
// pouvoir changer d'avis sans tout ressaisir.
function setTiered(form: BandForm, on: boolean) {
  form.tiered = on
  if (on && form.tiers.length < 2) {
    // Grille de départ : le prix actuel devient celui de la première tranche.
    form.tiers = [
      { uptoKm: '', priceEuros: form.pricePerKmEuros },
      { uptoKm: '', priceEuros: '' },
    ]
  }
  if (!on && !form.pricePerKmEuros && form.tiers[0]?.priceEuros) {
    form.pricePerKmEuros = form.tiers[0].priceEuros
  }
}

// Partie « prix » du corps envoyé à l'API : grille validée, ou prix unique
// avec `tiers: []` (ce qui supprime la grille existante côté serveur).
function bandPriceBody(form: BandForm) {
  return form.tiered
    ? { tiers: parseTierRows(form.tiers) ?? [] }
    : { pricePerKmCents: Math.round(parseFloat(form.pricePerKmEuros) * 100), tiers: [] }
}

const newBandPriceValid = computed(() =>
  newBand.tiered ? parseTierRows(newBand.tiers) != null : !!newBand.pricePerKmEuros,
)
const editBandPriceValid = computed(() =>
  editBandForm.tiered ? parseTierRows(editBandForm.tiers) != null : !!editBandForm.pricePerKmEuros,
)

// Résumé d'une grille sur la carte : « 2,00 € → 1,70 € → 1,10 €/km ».
function tierSummary(b: Record<string, unknown>): string {
  return bandTiers(b)
    .map((t) => formatMoney(t.pricePerKmCents, currency.value))
    .join(' → ') + '/km'
}

function toggleDay(form: BandForm, day: number) {
  const i = form.daysOfWeek.indexOf(day)
  if (i === -1) form.daysOfWeek.push(day)
  else form.daysOfWeek.splice(i, 1)
}

function startEditBand(b: Record<string, unknown>) {
  editingBand.value = b.id as string
  editBandForm.name = b.name as string
  editBandForm.pricePerKmEuros = ((b.pricePerKmCents as number) / 100).toFixed(2)
  const tiers = bandTiers(b)
  editBandForm.tiered = tiers.length >= 2
  editBandForm.tiers = tiers.map((t) => ({
    uptoKm: t.uptoKm != null ? String(t.uptoKm) : '',
    priceEuros: (t.pricePerKmCents / 100).toFixed(2),
  }))
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
        ...bandPriceBody(newBand),
        ...bandMinutes(newBand),
        daysOfWeek: newBand.daysOfWeek,
        // Un nouveau tarif spécifique doit gagner sur les existants quand il
        // s'applique : priorité auto = max + 1 (ajustable dans « Avancé »).
        priority: newBand.priority ||
          Math.max(0, ...transferBands.value.map((b) => b.priority as number)) + 1,
        isDefault: newBand.isDefault,
      },
    })
    Object.assign(newBand, { name: '', pricePerKmEuros: '', tiered: false, tiers: [], startTime: '06:00', endTime: '22:00', daysOfWeek: [], priority: 0, isDefault: false })
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
        ...bandPriceBody(editBandForm),
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

// ─── Mise à disposition : tarif de base + heure supplémentaire + 2e tranche ─

const hourly = reactive({
  enabled: false,
  pricePerHourEuros: '',
  overtimeEnabled: false,
  overtimeAfterHours: 8,
  overtimeRateEuros: '',
  overtime2Enabled: false,
  overtime2AfterHours: 12,
  overtime2RateEuros: '',
})

watchEffect(() => {
  if (!me.value) return
  const d = me.value as Record<string, unknown>
  const rate = d.hourlyRateCents as number | null
  const otAfter = d.hourlyOvertimeAfterHours as number | null
  const otRate = d.hourlyOvertimeRateCents as number | null
  const ot2After = d.hourlyOvertime2AfterHours as number | null
  const ot2Rate = d.hourlyOvertime2RateCents as number | null
  hourly.enabled = rate != null
  hourly.pricePerHourEuros = rate != null ? (rate / 100).toFixed(2) : ''
  hourly.overtimeEnabled = otAfter != null && otRate != null
  hourly.overtimeAfterHours = otAfter ?? 8
  hourly.overtimeRateEuros = otRate != null ? (otRate / 100).toFixed(2) : ''
  hourly.overtime2Enabled = ot2After != null && ot2Rate != null
  hourly.overtime2AfterHours = ot2After ?? 12
  hourly.overtime2RateEuros = ot2Rate != null ? (ot2Rate / 100).toFixed(2) : ''
})

// `v` peut être un nombre : v-model sur un input type="number" caste
// automatiquement la valeur en Vue 3 (parseFloat convertit lui-même en chaîne).
function eurosToCents(v: string | number): number | null {
  const n = parseFloat(String(v))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

const hourlyRateCentsInput = computed(() => eurosToCents(hourly.pricePerHourEuros))
const hourlyOvertimeCentsInput = computed(() => eurosToCents(hourly.overtimeRateEuros))
const hourlyOvertimeValid = computed(
  () =>
    hourlyOvertimeCentsInput.value != null &&
    hourly.overtimeAfterHours >= 1 &&
    hourly.overtimeAfterHours <= 23,
)

// La seconde tranche n'existe que comme prolongement de la première : son
// seuil doit dépasser strictement le premier.
const hourlyOvertime2Active = computed(() => hourly.overtimeEnabled && hourly.overtime2Enabled)
const hourlyOvertime2CentsInput = computed(() => eurosToCents(hourly.overtime2RateEuros))
const hourlyOvertime2Valid = computed(
  () =>
    hourlyOvertime2CentsInput.value != null &&
    hourly.overtime2AfterHours > hourly.overtimeAfterHours &&
    hourly.overtime2AfterHours <= 23,
)

// Phrase récapitulative : le paramétrage se relit d'une traite, impossible à
// mal interpréter (« Les 8 premières heures à 50 €/h, puis 40 €/h… »).
const hourlyRecap = computed(() => {
  const base = hourlyRateCentsInput.value
  if (!base) return ''
  if (hourly.overtimeEnabled && hourlyOvertimeValid.value) {
    const first = `Les ${hourly.overtimeAfterHours} premières heures à ${formatMoney(base, currency.value)}/h`
    if (hourlyOvertime2Active.value && hourlyOvertime2Valid.value) {
      return `${first}, puis ${formatMoney(hourlyOvertimeCentsInput.value!, currency.value)}/h jusqu'à la ${hourly.overtime2AfterHours}e heure, puis ${formatMoney(hourlyOvertime2CentsInput.value!, currency.value)}/h par heure supplémentaire.`
    }
    return `${first}, puis ${formatMoney(hourlyOvertimeCentsInput.value!, currency.value)}/h par heure supplémentaire.`
  }
  return `Tarif unique : ${formatMoney(base, currency.value)}/h, quelle que soit la durée.`
})

// Exemple chiffré au-delà du dernier seuil : montre le devis ligne par ligne.
const hourlyExample = computed(() => {
  const base = hourlyRateCentsInput.value
  if (!base || !hourly.overtimeEnabled || !hourlyOvertimeValid.value) return ''
  const after = hourly.overtimeAfterHours
  const ot = hourlyOvertimeCentsInput.value!
  if (hourlyOvertime2Active.value && hourlyOvertime2Valid.value) {
    const after2 = hourly.overtime2AfterHours
    const ot2 = hourlyOvertime2CentsInput.value!
    const midHours = after2 - after
    const total = base * after + ot * midHours + ot2 * 2
    return `Exemple : ${after2 + 2} h = ${after} h × ${formatMoney(base, currency.value)} + ${midHours} h × ${formatMoney(ot, currency.value)} + 2 h × ${formatMoney(ot2, currency.value)} = ${formatMoney(total, currency.value)}.`
  }
  const total = base * after + ot * 2
  return `Exemple : ${after + 2} h = ${after} h × ${formatMoney(base, currency.value)} + 2 h × ${formatMoney(ot, currency.value)} = ${formatMoney(total, currency.value)}.`
})

const hourlySaveDisabled = computed(
  () =>
    saving.value === 'hourly' ||
    (hourly.enabled &&
      (!hourlyRateCentsInput.value ||
        (hourly.overtimeEnabled && !hourlyOvertimeValid.value) ||
        (hourlyOvertime2Active.value && !hourlyOvertime2Valid.value))),
)

async function saveHourly() {
  await call('hourly', () =>
    $fetch('/api/dashboard/rates/hourly', {
      method: 'PUT',
      body: hourly.enabled
        ? {
            enabled: true,
            pricePerHourCents: hourlyRateCentsInput.value,
            overtimeAfterHours: hourly.overtimeEnabled ? hourly.overtimeAfterHours : null,
            overtimeRateCents: hourly.overtimeEnabled ? hourlyOvertimeCentsInput.value : null,
            overtime2AfterHours: hourlyOvertime2Active.value ? hourly.overtime2AfterHours : null,
            overtime2RateCents: hourlyOvertime2Active.value
              ? hourlyOvertime2CentsInput.value
              : null,
          }
        : { enabled: false },
    }),
  )
}

// ─── Majoration dernière minute ───────────────────────────────────────────
// Une seule règle, simple : « course réservée moins de X heures avant le départ
// → +Y € ». Stockée comme un supplément automatique borné par une fenêtre
// (maxLeadTimeMinutes) : le moteur de devis l'applique déjà, et la page publique
// prévient le client dès que son horaire tombe dans la fenêtre.

const lastMinute = reactive({ enabled: false, hoursDisplay: '2', amountEuros: '' })

// La règle en vigueur : premier supplément automatique à fenêtre, en euros.
const lastMinuteRow = computed(
  () =>
    surcharges.value.find(
      (s) => (s.autoApply as boolean) && s.maxLeadTimeMinutes != null && s.kind === 'FIXED',
    ) ?? null,
)

// Suppléments créés avec l'ancien réglage « Suppléments » : plus éditables, mais
// listés tant qu'ils existent — ceux « auto » s'ajoutent encore à chaque devis,
// les laisser invisibles fausserait les prix.
const legacySurcharges = computed(() => surcharges.value.filter((s) => s !== lastMinuteRow.value))

// Synchronise le formulaire depuis la règle stockée — uniquement quand elle
// change réellement (chargement, enregistrement, suppression). Un watchEffect
// écraserait le toggle pendant que le chauffeur l'active, `me` étant chargé en
// lazy et rafraîchi après chaque enregistrement de la page.
watch(
  lastMinuteRow,
  (row) => {
    if (!row) {
      lastMinute.enabled = false
      return
    }
    lastMinute.enabled = true
    lastMinute.hoursDisplay = String((row.maxLeadTimeMinutes as number) / 60)
    lastMinute.amountEuros = ((row.amount as number) / 100).toFixed(2)
  },
  { immediate: true },
)

// Fenêtre « dernière minute » : saisie en heures dans l'UI, stockée en minutes.
// `display` peut être un nombre : v-model sur un input type="number" caste
// automatiquement la valeur en Vue 3.
function parseLeadTimeMinutes(display: string | number): number | null {
  const hours = parseFloat(String(display).replace(',', '.'))
  if (!Number.isFinite(hours) || hours <= 0) return null
  return Math.round(hours * 60)
}

function formatLeadTime(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} h`
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60}`
}

const lastMinuteMinutes = computed(() => parseLeadTimeMinutes(lastMinute.hoursDisplay))
const lastMinuteCents = computed(() => eurosToCents(lastMinute.amountEuros))
const lastMinuteValid = computed(() => lastMinuteMinutes.value != null && lastMinuteCents.value != null)

const lastMinuteRecap = computed(() => {
  if (!lastMinute.enabled || !lastMinuteValid.value) return ''
  return `Une course réservée moins de ${formatLeadTime(lastMinuteMinutes.value!)} avant le départ est majorée de ${formatMoney(lastMinuteCents.value!, currency.value)}.`
})

// Fenêtre ≤ délai minimum de réservation = majoration inatteignable (les
// demandes plus tardives que le délai minimum sont refusées d'office).
const lastMinuteUnreachable = computed(
  () =>
    lastMinute.enabled &&
    lastMinuteMinutes.value != null &&
    lastMinuteMinutes.value <= settings.minLeadTimeMinutes,
)

const lastMinuteSaveDisabled = computed(
  () => saving.value === 'last-minute' || (lastMinute.enabled && !lastMinuteValid.value),
)

async function saveLastMinute() {
  const row = lastMinuteRow.value
  await call('last-minute', async () => {
    if (!lastMinute.enabled) {
      if (row) await $fetch(`/api/dashboard/surcharges/${row.id}`, { method: 'DELETE' })
      return
    }
    const body = {
      name: 'Majoration dernière minute',
      kind: 'FIXED' as const,
      amount: lastMinuteCents.value!,
      autoApply: true,
      maxLeadTimeMinutes: lastMinuteMinutes.value!,
    }
    if (row) await $fetch(`/api/dashboard/surcharges/${row.id}`, { method: 'PATCH', body })
    else await $fetch('/api/dashboard/surcharges', { method: 'POST', body })
  })
}

// Montant d'un ancien supplément (« + 10 € », « + 5 % »).
function surchargeAmount(s: Record<string, unknown>): string {
  if (s.kind === 'PERCENT') return `+ ${((s.amount as number) / 100).toFixed(1).replace('.0', '')} %`
  return `+ ${formatMoney(s.amount as number, currency.value)}`
}

async function deleteSurcharge(id: string) {
  if (!confirm('Supprimer ce supplément ?')) return
  await call(`surcharge-del-${id}`, () =>
    $fetch(`/api/dashboard/surcharges/${id}`, { method: 'DELETE' }),
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
      <!-- Transfert (au km) -->
      <div class="card space-y-3">
        <div>
          <h2 class="font-semibold text-slate-900">Transfert — prix au km</h2>
          <p class="mt-1 text-sm text-slate-600">
            Prix d'un trajet = distance × votre prix au km, selon le moment du départ.
            Le prix au km peut être dégressif par paliers de distance.
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
            <div>
              <label class="label">Nom du tarif</label>
              <input v-model="editBandForm.name" type="text" class="field" placeholder="Nuit, Week-end…" />
            </div>
            <div>
              <label class="label">Prix au km</label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
                  :class="!editBandForm.tiered
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'"
                  @click="setTiered(editBandForm, false)"
                >
                  Prix unique
                </button>
                <button
                  type="button"
                  class="rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
                  :class="editBandForm.tiered
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'"
                  @click="setTiered(editBandForm, true)"
                >
                  Dégressif selon la distance
                </button>
              </div>
              <input
                v-if="!editBandForm.tiered"
                v-model="editBandForm.pricePerKmEuros"
                type="number"
                step="0.01"
                min="0.01"
                class="field mt-2 !w-36"
                placeholder="2,50"
              />
              <RateTierEditor v-else class="mt-2.5" :tiers="editBandForm.tiers" :currency="currency" />
            </div>
            <div class="grid grid-cols-2 gap-3">
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
              <button type="button" class="btn-primary !py-2.5 text-sm" :disabled="saving === `band-edit-${b.id}` || !editBandPriceValid" @click="updateBand(b.id as string)">
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
              <p v-if="bandTiers(b).length" class="mt-0.5 text-[11px] text-slate-500">{{ tierSummary(b) }}</p>
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
            <div>
              <label class="label">Nom du tarif</label>
              <input v-model="newBand.name" type="text" class="field" placeholder="Nuit, Week-end…" />
            </div>
            <div>
              <label class="label">Prix au km</label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
                  :class="!newBand.tiered
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'"
                  @click="setTiered(newBand, false)"
                >
                  Prix unique
                </button>
                <button
                  type="button"
                  class="rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
                  :class="newBand.tiered
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'"
                  @click="setTiered(newBand, true)"
                >
                  Dégressif selon la distance
                </button>
              </div>
              <input
                v-if="!newBand.tiered"
                v-model="newBand.pricePerKmEuros"
                type="number"
                step="0.01"
                min="0.01"
                class="field mt-2 !w-36"
                placeholder="2,50"
              />
              <RateTierEditor v-else class="mt-2.5" :tiers="newBand.tiers" :currency="currency" />
            </div>
            <div class="grid grid-cols-2 gap-3">
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
              <button type="button" class="btn-primary whitespace-nowrap !py-2.5 text-sm" :disabled="saving === 'band-add' || !newBand.name || !newBandPriceValid" @click="addBand">
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

      <!-- Mise à disposition : tarif de base + heure supplémentaire + 2e tranche -->
      <form class="card space-y-4" @submit.prevent="saveHourly">
        <div>
          <h2 class="font-semibold text-slate-900">Mise à disposition — prix à l'heure</h2>
          <p class="mt-1 text-sm text-slate-600">
            Votre tarif horaire et, si vous le souhaitez, une ou deux tranches de prix
            réduites au-delà d'un certain nombre d'heures.
          </p>
        </div>

        <label class="flex items-center gap-2.5 py-1 text-sm text-slate-600">
          <input v-model="hourly.enabled" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
          Proposer la mise à disposition sur ma page
        </label>

        <template v-if="hourly.enabled">
          <div class="w-40">
            <label class="label" for="hourly-rate">Tarif horaire (€/h)</label>
            <input id="hourly-rate" v-model="hourly.pricePerHourEuros" type="number" step="0.01" min="0.01" class="field" placeholder="50,00" />
          </div>

          <label class="flex items-center gap-2.5 py-1 text-sm text-slate-600">
            <input v-model="hourly.overtimeEnabled" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
            Tarif réduit pour les heures supplémentaires
          </label>

          <template v-if="hourly.overtimeEnabled">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="hourly-after">Au-delà de (heures)</label>
                <input id="hourly-after" v-model.number="hourly.overtimeAfterHours" type="number" min="1" max="23" class="field" />
              </div>
              <div>
                <label class="label" for="hourly-overtime">Heure supplémentaire (€/h)</label>
                <input id="hourly-overtime" v-model="hourly.overtimeRateEuros" type="number" step="0.01" min="0.01" class="field" placeholder="40,00" />
              </div>
            </div>

            <label class="flex items-center gap-2.5 py-1 text-sm text-slate-600">
              <input v-model="hourly.overtime2Enabled" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
              Nouvelle tranche de prix au-delà d'un certain nombre d'heures
            </label>

            <div v-if="hourly.overtime2Enabled" class="grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="hourly-after-2">Au-delà de (heures)</label>
                <input id="hourly-after-2" v-model.number="hourly.overtime2AfterHours" type="number" :min="hourly.overtimeAfterHours + 1" max="23" class="field" />
              </div>
              <div>
                <label class="label" for="hourly-overtime-2">Heure supplémentaire (€/h)</label>
                <input id="hourly-overtime-2" v-model="hourly.overtime2RateEuros" type="number" step="0.01" min="0.01" class="field" placeholder="35,00" />
              </div>
            </div>
          </template>

          <div v-if="hourlyRecap" class="rounded-xl bg-brand-50 px-4 py-3">
            <p class="text-sm font-medium text-slate-900">{{ hourlyRecap }}</p>
            <p v-if="hourlyExample" class="mt-1 text-xs text-slate-500">{{ hourlyExample }}</p>
          </div>
        </template>
        <p v-else class="text-sm text-slate-500">
          La mise à disposition n'apparaît pas sur votre page de réservation.
        </p>

        <button type="submit" class="btn-primary !py-2.5 text-sm" :disabled="hourlySaveDisabled">
          {{ saving === 'hourly' ? '…' : 'Enregistrer' }}
        </button>
      </form>

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

      <!-- Majoration dernière minute -->
      <form class="card space-y-4" @submit.prevent="saveLastMinute">
        <div>
          <h2 class="font-semibold text-slate-900">Majoration dernière minute</h2>
          <p class="mt-1 text-sm text-slate-600">
            Ajoutez automatiquement un supplément quand un client réserve peu de temps
            avant le départ. Il est prévenu sur votre page et la majoration apparaît
            dans le détail de son prix.
          </p>
        </div>

        <label class="flex items-center gap-2.5 py-1 text-sm text-slate-600">
          <input v-model="lastMinute.enabled" type="checkbox" class="h-5 w-5 shrink-0 rounded accent-brand-600" />
          Majorer les réservations de dernière minute
        </label>

        <template v-if="lastMinute.enabled">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="lm-hours">Si réservé moins de … heures avant</label>
              <input id="lm-hours" v-model="lastMinute.hoursDisplay" type="number" step="0.5" min="0.5" class="field" placeholder="2" />
            </div>
            <div>
              <label class="label" for="lm-amount">Majoration (€)</label>
              <input id="lm-amount" v-model="lastMinute.amountEuros" type="number" step="0.01" min="0.01" class="field" placeholder="20,00" />
            </div>
          </div>

          <div v-if="lastMinuteRecap" class="rounded-xl bg-brand-50 px-4 py-3">
            <p class="text-sm font-medium text-slate-900">{{ lastMinuteRecap }}</p>
            <p class="mt-1 text-xs text-slate-500">
              Le client est prévenu dès qu'il choisit un horaire dans la fenêtre, avant de réserver.
            </p>
          </div>

          <p v-if="lastMinuteUnreachable" class="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Votre délai minimum de réservation est de
            {{ formatLeadTime(settings.minLeadTimeMinutes) }} (onglet Général) : aucune
            course ne peut être réservée moins de
            {{ formatLeadTime(lastMinuteMinutes ?? 0) }} avant le départ, la majoration ne
            s'appliquerait donc jamais. Élargissez la fenêtre ou réduisez le délai minimum.
          </p>
        </template>
        <p v-else class="text-sm text-slate-500">
          Aucune majoration : le prix est le même quel que soit le moment de la réservation.
        </p>

        <button type="submit" class="btn-primary !py-2.5 text-sm" :disabled="lastMinuteSaveDisabled">
          {{ saving === 'last-minute' ? '…' : 'Enregistrer' }}
        </button>

        <!-- Suppléments créés avec l'ancien réglage : visibles tant qu'ils existent
             (les « auto » s'ajoutent encore aux devis), puis ce bloc disparaît. -->
        <div v-if="legacySurcharges.length" class="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p class="text-sm font-semibold text-amber-900">Anciens suppléments</p>
          <p class="mt-1 text-xs text-amber-800">
            Créés avec l'ancien réglage « Suppléments ». Ceux marqués « auto » s'ajoutent
            encore automatiquement à chaque devis : supprimez-les s'ils ne sont plus souhaités.
          </p>
          <div
            v-for="s in legacySurcharges"
            :key="(s as Record<string, unknown>).id as string"
            class="mt-2 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
          >
            <p class="min-w-0 truncate text-sm text-slate-800">
              {{ s.name }} · {{ surchargeAmount(s) }}<template v-if="s.autoApply"> · auto</template><template v-if="s.maxLeadTimeMinutes"> · si réservé moins de {{ formatLeadTime(s.maxLeadTimeMinutes as number) }} avant</template>
            </p>
            <button
              type="button"
              class="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
              :disabled="saving === `surcharge-del-${s.id}`"
              @click="deleteSurcharge(s.id as string)"
            >
              Supprimer
            </button>
          </div>
        </div>
      </form>
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

      <!-- Avis Google -->
      <div class="card">
        <h2 class="font-semibold text-slate-900">Avis clients (Google)</h2>
        <p class="mt-1 text-sm text-slate-600">
          Retrouvez votre fiche d'établissement Google : le lien « laisser un avis » sera ajouté
          automatiquement au reçu envoyé à vos clients après chaque course, et affiché sur votre
          page publique.
        </p>

        <div class="mt-3">
          <p v-if="googlePlace" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
            ✅ Fiche connectée : {{ googlePlace.name }}
          </p>
          <p v-else-if="manualReviewUrl" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
            ✅ Lien d'avis actif (collé à la main)
          </p>
          <p v-else class="text-sm text-slate-500">Aucune fiche connectée.</p>
        </div>

        <!-- Fiche connectée : vérifier le lien, ou déconnecter -->
        <template v-if="googlePlace">
          <p v-if="googlePlace.address" class="mt-2 text-xs text-slate-500">{{ googlePlace.address }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <a :href="reviewTestPath" target="_blank" rel="noopener" class="btn-primary">
              Tester le lien d'avis
            </a>
            <button class="btn-ghost" :disabled="saving === 'place-disconnect'" @click="disconnectPlace">
              Déconnecter
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">
            Le test ouvre votre page de notation, comme vos clients : 5 étoiles vous redirige vers
            votre fiche — vérifiez que c'est bien la vôtre.
          </p>
        </template>

        <!-- Lien manuel actif : tester, retirer, ou remplacer par une fiche -->
        <template v-else-if="manualReviewUrl">
          <p class="mt-2 break-all text-xs text-slate-500">{{ manualReviewUrl }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <a :href="reviewTestPath" target="_blank" rel="noopener" class="btn-primary">
              Tester le lien d'avis
            </a>
            <button class="btn-ghost" :disabled="saving === 'review-url-clear'" @click="clearManualUrl">
              Retirer
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">
            Vous pouvez aussi le remplacer en connectant votre fiche Google ci-dessous.
          </p>
        </template>

        <!-- Recherche de la fiche (tant qu'aucune n'est connectée) -->
        <div v-if="!googlePlace" class="mt-4">
          <form class="flex items-end gap-2" @submit.prevent="searchPlace">
            <div class="min-w-0 flex-1">
              <label class="label" for="place-query">Nom de votre entreprise + ville, ou lien Google Maps</label>
              <input
                id="place-query"
                v-model="placeQuery"
                type="text"
                class="field"
                maxlength="500"
                placeholder="Ex : Karim VTC Lyon"
              />
            </div>
            <button class="btn-primary whitespace-nowrap" :disabled="placeSearching || placeQuery.trim().length < 2">
              {{ placeSearching ? 'Recherche…' : 'Rechercher' }}
            </button>
          </form>

          <div v-if="placeResults" class="mt-3 space-y-2">
            <p v-if="placeResults.length === 0" class="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Aucun établissement trouvé. Essayez le nom exact de votre fiche + votre ville, ou
              <strong>collez le lien de votre fiche depuis l'app Google Maps</strong>
              (votre fiche → Partager → Copier le lien) dans le champ ci-dessus.
              En dernier recours, utilisez votre lien d'avis ci-dessous.
            </p>
            <button
              v-for="p in placeResults"
              :key="p.placeId"
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/40"
              :disabled="saving === `place-connect-${p.placeId}`"
              @click="connectPlace(p)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-slate-900">{{ p.name }}</span>
                <span class="block truncate text-xs text-slate-500">{{ p.address }}</span>
              </span>
              <span class="shrink-0 text-sm font-semibold text-brand-700">
                {{ saving === `place-connect-${p.placeId}` ? '…' : 'Connecter' }}
              </span>
            </button>
          </div>

          <!-- Échappatoire : fiche introuvable, ou plateforme d'avis tierce -->
          <details class="mt-4 text-sm text-slate-600" :open="manualUrlOpen">
            <summary class="cursor-pointer py-2 font-medium text-slate-700" @click.prevent="manualUrlOpen = !manualUrlOpen">
              {{ manualReviewUrl ? 'Modifier mon lien d’avis' : 'Ma fiche est introuvable ? Collez un lien d’avis' }}
            </summary>
            <form class="mt-2 flex gap-2" @submit.prevent="saveManualUrl">
              <input
                v-model="manualUrlInput"
                type="url"
                class="field min-w-0 flex-1"
                maxlength="500"
                placeholder="https://g.page/r/… ou https://fr.trustpilot.com/…"
              />
              <button class="btn-primary whitespace-nowrap" :disabled="saving === 'review-url' || !manualUrlInput.trim()">
                {{ saving === 'review-url' ? '…' : 'Enregistrer' }}
              </button>
            </form>
          </details>
        </div>
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
