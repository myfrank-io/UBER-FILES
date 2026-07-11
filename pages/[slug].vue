<script setup lang="ts">
// Page publique de réservation d'un chauffeur (marque blanche, mobile-first).
import { PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'

const route = useRoute()
const slug = route.params.slug as string
const { formatMoney } = useFormat()
const { t } = useI18n()

interface PublicVehicle {
  id: string
  make: string
  modelFamily: string
  modelLabel: string
  vehicleClass: string | null
  seats: number | null
  color: string | null
  isPrimary: boolean
  // Photo personnelle du chauffeur (prioritaire sur l'image CDN du modèle).
  photoSrc: string | null
}

interface BookingModePublic {
  // La demande aboutit sans validation manuelle du chauffeur.
  instant: boolean
  autoConfirm: boolean
  onlineAvailable: boolean
  onlineRequired: boolean
  onSiteMethods: PaymentMethod[]
}

interface DriverPublic {
  slug: string
  displayName: string
  tagline: string | null
  photoUrl: string | null
  phone: string | null
  contactEmail: string | null
  vehicle: { make: string | null; model: string | null; class: string | null; seats: number | null }
  vehicles: PublicVehicle[]
  reviewUrl: string | null
  currency: string
  minimumFareCents: number
  minLeadTimeMinutes: number
  hasTransfer: boolean
  bookingEnabled: boolean
  hasHourly: boolean
  // Majoration appliquée aux réservations faites moins de X minutes avant le départ.
  lastMinuteSurcharge: { maxLeadTimeMinutes: number; amountCents: number } | null
  acceptedPaymentMethods: PaymentMethod[]
  bookingMode: BookingModePublic
}

const { data: driver, error } = await useFetch<DriverPublic>(`/api/public/${slug}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable', fatal: true })
}
const appBase = useRuntimeConfig().public.appBaseUrl

// Véhicule agrandi au clic (lightbox).
const zoomedVehicle = ref<PublicVehicle | null>(null)

useHead(() => {
  const d = driver.value
  if (!d) return { title: t('common.appName') }
  const description = d.tagline ?? t('public.metaDescription', { name: d.displayName })
  const url = `${appBase}/${d.slug}`
  // La photo est servie en URL http (absolue ou chemin /api/public/…/photo) :
  // on la rend absolue pour les crawlers des réseaux sociaux.
  const image = d.photoUrl
    ? d.photoUrl.startsWith('http')
      ? d.photoUrl
      : `${appBase}${d.photoUrl}`
    : `${appBase}/og-default.jpg`
  // Données structurées schema.org (JSON-LD) : aident Google à comprendre qu'il
  // s'agit d'une entreprise de transport locale (nom, contact, image) et à
  // faire ressortir la fiche dans les résultats. Pas de note/avis simulés ici —
  // Google pénalise les `aggregateRating` non vérifiables.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url,
    name: d.displayName,
    url,
    image,
    description,
    priceRange: '€€',
    ...(d.phone ? { telephone: d.phone } : {}),
    // Fiche d'avis publique du chauffeur (Google, Trustpilot…) rattachée à l'entité.
    ...(d.reviewUrl ? { sameAs: [d.reviewUrl] } : {}),
  }
  return {
    title: t('public.metaTitle', { name: d.displayName }),
    meta: [
      { name: 'description', content: description },
      // Open Graph
      { property: 'og:title', content: d.displayName },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:type', content: 'website' },
      // Twitter Card
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: d.displayName },
      { name: 'twitter:description', content: description },
    ],
    link: [{ rel: 'canonical', href: url }],
    script: [
      // On échappe « < » (→ <) pour empêcher qu'un champ saisi par le
      // chauffeur (nom, accroche…) contenant une balise script fermante ne casse la page.
      { type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd).replace(/</g, '\\u003c') },
    ],
  }
})

// ─── État du formulaire ───
// Transfert par défaut — la mise à disposition n'est présélectionnée que si le
// chauffeur ne propose pas de transfert.
const type = ref<'TRANSFER' | 'HOURLY'>(driver.value?.hasTransfer === false ? 'HOURLY' : 'TRANSFER')
const pickup = ref('')
const dropoff = ref('')
// Coordonnées exactes résolues à la sélection d'une suggestion (placeId → Place
// Details). null tant que l'utilisateur tape librement → repli géocodage du texte.
const pickupCoords = ref<{ lat: number; lng: number } | null>(null)
const dropoffCoords = ref<{ lat: number; lng: number } | null>(null)
// Terminal/hall de prise en charge choisi (hubs) + coords précises de ce terminal.
const pickupTerminal = ref<string | null>(null)
const terminalCoords = ref<{ lat: number; lng: number } | null>(null)
const roundTrip = ref(false)
const durationHours = ref(2)
const scheduledAt = ref(defaultDateTime())
const customer = reactive({ name: '', phone: '', email: '' })
const notes = ref('')
const cgvAccepted = ref(false)

function toDatetimeLocal(d: Date): string {
  // format pour <input type="datetime-local"> (heure locale)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

function defaultDateTime(): string {
  const leadMs = (driver.value?.minLeadTimeMinutes ?? 180) * 60_000
  const d = new Date(Date.now() + Math.max(leadMs, 3 * 3600_000))
  d.setMinutes(0, 0, 0)
  // L'arrondi à l'heure ne doit pas retomber sous le délai minimum.
  if (d.getTime() < Date.now() + leadMs) d.setTime(d.getTime() + 3600_000)
  return toDatetimeLocal(d)
}

// Borne basse du sélecteur : impossible de choisir une date déjà passée ou sous le
// délai minimum de réservation (l'erreur n'apparaissait sinon qu'à l'estimation).
const minScheduledAt = computed(() =>
  toDatetimeLocal(new Date(Date.now() + (driver.value?.minLeadTimeMinutes ?? 0) * 60_000)),
)

// Fenêtre en clair : « 45 min », « 2 h », « 1 h 30 ».
function formatLeadWindow(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

// Majoration dernière minute : le client est prévenu dès que l'horaire choisi
// tombe dans la fenêtre — la ligne figure ensuite dans le détail de l'estimation.
const lastMinuteNotice = computed(() => {
  const s = driver.value?.lastMinuteSurcharge
  if (!s || !scheduledAt.value) return ''
  const leadMs = new Date(scheduledAt.value).getTime() - Date.now()
  if (Number.isNaN(leadMs) || leadMs >= s.maxLeadTimeMinutes * 60_000) return ''
  return t('public.lastMinuteNotice', {
    window: formatLeadWindow(s.maxLeadTimeMinutes),
    amount: formatMoney(s.amountCents, driver.value!.currency),
  })
})

const estimate = ref<{ amountCents: number; currency: string; breakdown: { label: string; amountCents: number; detail?: string }[] } | null>(null)
const estimating = ref(false)
const submitting = ref(false)
const errorMsg = ref('')
const submitted = ref(false)
// Résultat d'une confirmation immédiate (règlement sur place, créneau libre).
const confirmedBooking = ref(false)
const manageUrl = ref<string | null>(null)
// La demande envoyée attend-elle un règlement sur place ? (adapte le message de succès)
const submittedOnSite = ref(false)

// ─── Choix du règlement (quand plusieurs options existent) ───
interface PaymentOption {
  value: PaymentMethod
  label: string
  hint: string
}

const paymentOptions = computed<PaymentOption[]>(() => {
  const m = driver.value?.bookingMode
  if (!m) return []
  const options: PaymentOption[] = []
  if (m.onlineAvailable) {
    options.push({
      value: 'STRIPE_PREPAYMENT',
      label: m.autoConfirm ? t('public.payOnlineNow') : t('public.payOnlineLater'),
      hint: m.autoConfirm ? t('public.payOnlineNowHint') : t('public.payOnlineLaterHint'),
    })
  }
  for (const method of m.onSiteMethods) {
    options.push({
      value: method,
      label: t('public.payOnSiteOption', { method: PAYMENT_METHOD_SHORT_LABELS[method] }),
      hint: m.autoConfirm ? t('public.payOnSiteInstantHint') : t('public.payOnSiteManualHint'),
    })
  }
  return options
})

const selectedPayment = ref<PaymentMethod | null>(null)
watchEffect(() => {
  if (!selectedPayment.value && paymentOptions.value.length) {
    selectedPayment.value = paymentOptions.value[0]!.value
  }
})
const selectedIsOnline = computed(() => selectedPayment.value === 'STRIPE_PREPAYMENT')

// Flux en deux étapes : 1) course + estimation, 2) coordonnées du client.
// Les coordonnées ne sont demandées qu'après avoir estimé et cliqué sur « Réserver ».
const step = ref<'details' | 'contact'>('details')

// Toute modification de la course invalide l'estimation (et ramène à l'étape 1) :
// on ne peut pas réserver sur un prix périmé.
watch([type, pickup, dropoff, roundTrip, durationHours, scheduledAt], () => {
  estimate.value = null
  step.value = 'details'
})

async function geocode(address: string) {
  return $fetch<{ lat: number; lng: number; formatted: string }>('/api/public/geocode', {
    method: 'POST',
    body: { address },
  })
}

// Coordonnées d'un champ : on privilégie la résolution exacte (placeId) faite à la
// sélection ; à défaut (saisie libre sans choix de suggestion) on géocode le texte.
async function resolveCoords(
  text: string,
  resolved: { lat: number; lng: number } | null,
): Promise<{ lat: number; lng: number }> {
  if (resolved) return resolved
  const g = await geocode(text)
  return { lat: g.lat, lng: g.lng }
}

function isoScheduledAt(): string {
  return new Date(scheduledAt.value).toISOString()
}

async function buildPayload() {
  const base: Record<string, unknown> = { type: type.value, scheduledAt: isoScheduledAt() }
  // Le terminal choisi (hub) fournit la coordonnée de prise en charge la plus précise.
  const pickupResolved = terminalCoords.value ?? pickupCoords.value
  if (pickupTerminal.value) base.pickupTerminal = pickupTerminal.value
  if (type.value === 'TRANSFER') {
    const [p, d] = await Promise.all([
      resolveCoords(pickup.value, pickupResolved),
      resolveCoords(dropoff.value, dropoffCoords.value),
    ])
    base.pickup = p
    base.dropoff = d
    base.pickupAddress = pickup.value
    base.dropoffAddress = dropoff.value
    base.roundTrip = roundTrip.value
  } else {
    // Mise à disposition : le lieu de prise en charge est requis aussi.
    base.pickup = await resolveCoords(pickup.value, pickupResolved)
    base.pickupAddress = pickup.value
    base.durationHours = durationHours.value
  }
  return base
}

// Amène le résultat (et le bouton « Réserver ») dans le viewport : sur mobile,
// l'estimation apparaît sinon sous la ligne de flottaison sans aucun indice.
const estimateBox = ref<HTMLElement | null>(null)

async function getEstimate() {
  errorMsg.value = ''
  estimating.value = true
  estimate.value = null
  try {
    const payload = await buildPayload()
    estimate.value = await $fetch(`/api/public/${slug}/estimate`, { method: 'POST', body: payload })
    await nextTick()
    // 'nearest' : ne défile que si le résultat est réellement hors écran.
    estimateBox.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  } catch (e) {
    errorMsg.value = errMessage(e)
  } finally {
    estimating.value = false
  }
}

async function submit() {
  errorMsg.value = ''
  if (!cgvAccepted.value) {
    errorMsg.value = t('public.cgvError')
    return
  }
  submitting.value = true
  try {
    const payload = await buildPayload()
    const res = await $fetch<{
      ok: boolean
      payUrl?: string | null
      confirmed?: boolean
      manageUrl?: string | null
    }>(`/api/public/${slug}/request`, {
      method: 'POST',
      body: {
        ...payload,
        customer,
        notes: notes.value,
        cgvAccepted: true,
        paymentMethod: selectedPayment.value ?? undefined,
      },
    })
    // Paiement en ligne immédiat : on emmène directement le client sur la page
    // de paiement du devis (pas d'attente de validation).
    if (res.payUrl) {
      await navigateTo(res.payUrl, { external: true })
      return
    }
    // Confirmation immédiate (règlement sur place) : la course est déjà réservée.
    if (res.confirmed) {
      confirmedBooking.value = true
      manageUrl.value = res.manageUrl ?? null
      return
    }
    // « Règlement sur place » seulement si c'est réellement le cas : choix
    // explicite d'un moyen sur place, ou chauffeur sans paiement en ligne
    // opérationnel MAIS avec des moyens sur place déclarés.
    const m = driver.value?.bookingMode
    submittedOnSite.value = selectedPayment.value
      ? !selectedIsOnline.value
      : Boolean(m && !m.onlineAvailable && m.onSiteMethods.length > 0)
    submitted.value = true
  } catch (e) {
    errorMsg.value = errMessage(e)
  } finally {
    submitting.value = false
  }
}

function errMessage(e: unknown): string {
  const err = e as { statusMessage?: string; data?: { statusMessage?: string; message?: string } }
  return err?.data?.statusMessage || err?.data?.message || err?.statusMessage || t('common.genericError')
}

const canEstimate = computed(() =>
  type.value === 'TRANSFER'
    ? pickup.value.length > 3 && dropoff.value.length > 3
    : pickup.value.length > 3 && durationHours.value >= 1,
)
const canSubmit = computed(
  () => Boolean(estimate.value) && customer.name.length >= 2 && customer.phone.length >= 6 && customer.email.includes('@'),
)

// Libellé du bouton de réservation : « Réserver et payer » quand l'envoi mène
// directement au paiement en ligne, sinon « Réserver ».
const reserveLabel = computed(() =>
  selectedIsOnline.value && driver.value?.bookingMode.autoConfirm
    ? t('public.reserveAndPay')
    : t('public.reserve'),
)

// Passage à l'étape « coordonnées » une fois le prix estimé.
function goToContact() {
  if (!estimate.value) return
  errorMsg.value = ''
  step.value = 'contact'
}
</script>

<template>
  <!-- Tout doit tenir dans l'écran (pas de scroll) : en-tête compact, formulaire
       dense. Une seule colonne partout — sur ordinateur, la page garde la même
       mise en page que sur mobile, simplement centrée. -->
  <div v-if="driver" class="mx-auto w-full max-w-lg px-4 py-3 sm:py-5 lg:py-8">
    <div>
      <!-- Bloc chauffeur : identité, repères et véhicules réunis dans une seule
           carte compacte, pour laisser l'écran au formulaire de réservation. -->
      <div class="card !p-4">
        <div class="flex items-center gap-3">
          <img
            v-if="driver.photoUrl"
            :src="driver.photoUrl"
            :alt="driver.displayName"
            class="h-12 w-12 shrink-0 rounded-full object-cover"
          />
          <div
            v-else
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700"
          >
            {{ driver.displayName.charAt(0) }}
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="truncate font-serif text-lg font-medium tracking-tight text-slate-900">{{ driver.displayName }}</h1>
            <p v-if="driver.tagline" class="truncate text-xs text-slate-500">{{ driver.tagline }}</p>
          </div>
        </div>
        <!-- Le sélecteur de langue vit dans la ligne des badges : il ne rogne
             pas le nom du chauffeur sur les petits écrans. -->
        <!-- Seul le badge valorisant « réservation instantanée » est affiché ;
             pas de badge quand le chauffeur valide manuellement. -->
        <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
          <span v-if="driver.bookingMode.instant" class="rounded-full bg-green-100 px-2.5 py-1 text-green-700">
            ⚡ {{ $t('public.instantBooking') }}
          </span>
          <!-- Véhicule du profil, seulement quand la flotte n'est pas renseignée
               (sinon les vignettes ci-dessous portent déjà l'info). -->
          <span
            v-if="!driver.vehicles.length && driver.vehicle.class"
            class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600"
          >
            {{ driver.vehicle.class }}<template v-if="driver.vehicle.seats"> · {{ $t('common.places', { count: driver.vehicle.seats }) }}</template>
          </span>
          <!-- Lien d'avis : passe par la page de notation Ridewiz (5★ → dépôt public
               sur la fiche du chauffeur, note inférieure → retour privé). Affiché
               seulement si un lien d'avis est configuré. -->
          <NuxtLink
            v-if="driver.reviewUrl"
            :to="`/avis/${driver.slug}`"
            class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 transition hover:bg-amber-100"
          >
            ⭐ {{ $t('public.leaveReview') }}
          </NuxtLink>
          <LangSwitcher class="ml-auto shrink-0" />
        </div>
        <!-- Véhicules : simples vignettes cliquables, le détail s'ouvre en grand. -->
        <div v-if="driver.vehicles && driver.vehicles.length" class="mt-3 flex gap-2 overflow-x-auto">
          <button
            v-for="v in driver.vehicles"
            :key="v.id"
            type="button"
            :title="v.modelLabel"
            :aria-label="v.modelLabel"
            class="h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white p-1 transition hover:border-slate-300 hover:shadow-sm"
            @click="zoomedVehicle = v"
          >
            <VehicleImage
              :make="v.make"
              :model-family="v.modelFamily"
              :vehicle-class="v.vehicleClass"
              :color="v.color"
              :photo-url="v.photoSrc"
              :alt="v.modelLabel"
            />
          </button>
        </div>
      </div>

      <!-- Colonne réservation : confirmation, demande envoyée ou formulaire. -->
      <div class="mt-3">
        <!-- Course confirmée immédiatement (règlement sur place, créneau libre) -->
        <div v-if="confirmedBooking" class="card border-green-200 bg-green-50 text-center">
          <p class="text-3xl">✅</p>
          <h2 class="mt-2 text-lg font-bold text-green-900">{{ $t('public.confirmedTitle') }}</h2>
          <p class="mt-2 text-sm text-green-800">
            {{ $t('public.confirmedBody', { name: driver.displayName, email: customer.email }) }}
          </p>
          <a v-if="manageUrl" :href="manageUrl" class="btn-primary mt-4 inline-block">
            {{ $t('public.manageBooking') }}
          </a>
        </div>

        <!-- Demande transmise, en attente de validation du chauffeur -->
        <div v-else-if="submitted" class="card border-green-200 bg-green-50 text-center">
          <p class="text-3xl">✅</p>
          <h2 class="mt-2 text-lg font-bold text-green-900">{{ $t('public.submittedTitle') }}</h2>
          <p class="mt-2 text-sm text-green-800">
            {{
              submittedOnSite
                ? $t('public.submittedBodyOnSite', { name: driver.displayName, email: customer.email })
                : $t('public.submittedBody', { name: driver.displayName, email: customer.email })
            }}
          </p>
        </div>

        <!-- Formulaire (toujours disponible, même si le paiement en ligne n'est pas activé) -->
        <form v-else class="card space-y-3.5 !p-4" @submit.prevent="submit">
          <!-- Étape 1 : course + estimation (les coordonnées ne sont pas encore demandées) -->
          <template v-if="step === 'details'">
            <!-- Type de prestation — transfert d'abord ; sélecteur masqué quand le
                 chauffeur ne propose qu'une seule prestation. -->
            <div
              v-if="driver.hasTransfer && driver.hasHourly"
              class="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
            >
              <!-- text-[13px] sur mobile : « Mise à disposition » doit tenir sur une seule ligne. -->
              <button
                type="button"
                class="whitespace-nowrap rounded-lg px-2 py-2.5 text-[13px] font-semibold transition sm:text-sm"
                :class="type === 'TRANSFER' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                :aria-pressed="type === 'TRANSFER'"
                @click="type = 'TRANSFER'"
              >
                {{ $t('public.typeTransfer') }}
              </button>
              <button
                type="button"
                class="whitespace-nowrap rounded-lg px-2 py-2.5 text-[13px] font-semibold transition sm:text-sm"
                :class="type === 'HOURLY' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                :aria-pressed="type === 'HOURLY'"
                @click="type = 'HOURLY'"
              >
                {{ $t('public.typeHourly') }}
              </button>
            </div>

            <!-- Transfert -->
            <template v-if="type === 'TRANSFER'">
              <div>
                <label class="label" for="pickup">{{ $t('public.pickupLabel') }}</label>
                <AddressField id="pickup" v-model="pickup" :placeholder="$t('public.pickupPlaceholder')" @resolve="pickupCoords = $event" />
                <TerminalPicker class="mt-3" :address="pickup" v-model="pickupTerminal" @coords="terminalCoords = $event" />
              </div>
              <div>
                <label class="label" for="dropoff">{{ $t('public.dropoffLabel') }}</label>
                <AddressField id="dropoff" v-model="dropoff" :placeholder="$t('public.dropoffPlaceholder')" @resolve="dropoffCoords = $event" />
              </div>
              <label class="flex items-center gap-2.5 py-1 text-sm text-slate-700">
                <input v-model="roundTrip" type="checkbox" class="h-5 w-5 shrink-0 rounded border-slate-300" />
                {{ $t('public.roundTrip') }}
              </label>
            </template>

            <!-- Mise à disposition -->
            <template v-else>
              <div>
                <label class="label" for="pickup-hourly">{{ $t('public.pickupLabel') }}</label>
                <AddressField id="pickup-hourly" v-model="pickup" :placeholder="$t('public.pickupPlaceholder')" @resolve="pickupCoords = $event" />
                <TerminalPicker class="mt-3" :address="pickup" v-model="pickupTerminal" @coords="terminalCoords = $event" />
              </div>
              <div>
                <label class="label" for="duration">{{ $t('public.durationLabel') }}</label>
                <input id="duration" v-model.number="durationHours" type="number" min="1" max="24" class="field" />
              </div>
            </template>

            <div>
              <label class="label" for="datetime">{{ $t('public.datetimeLabel') }}</label>
              <input id="datetime" v-model="scheduledAt" type="datetime-local" class="field" :min="minScheduledAt" />
              <p class="mt-1 text-xs text-slate-500">
                {{ $t('public.leadTime', { hours: Math.round(driver.minLeadTimeMinutes / 60) }) }}
              </p>
              <!-- Majoration dernière minute : annoncée avant même l'estimation. -->
              <p v-if="lastMinuteNotice" class="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                ⏱ {{ lastMinuteNotice }}
              </p>
            </div>

            <!-- Estimation — masquée dès qu'un prix est affiché (toute modification
                 de la course le réinitialise et fait réapparaître le bouton). -->
            <button
              v-if="!estimate"
              type="button"
              class="btn-ghost w-full"
              :disabled="!canEstimate || estimating"
              @click="getEstimate"
            >
              {{ estimating ? $t('public.estimating') : $t('public.estimateButton') }}
            </button>

            <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

            <template v-if="estimate">
              <div ref="estimateBox" class="scroll-mt-4 rounded-xl bg-slate-50 p-4">
                <div class="flex items-baseline justify-between">
                  <span class="text-sm text-slate-600">{{ $t('public.estimateLabel') }}</span>
                  <span class="font-serif text-2xl font-medium tracking-tight text-slate-900">
                    {{ formatMoney(estimate.amountCents, estimate.currency) }}
                  </span>
                </div>
                <ul class="mt-2 space-y-1 text-xs text-slate-500">
                  <li v-for="(line, i) in estimate.breakdown" :key="i" class="flex justify-between gap-3">
                    <span>{{ line.label }}<span v-if="line.detail"> — {{ line.detail }}</span></span>
                    <span class="shrink-0">{{ formatMoney(line.amountCents, estimate.currency) }}</span>
                  </li>
                </ul>
                <p class="mt-2 text-xs text-slate-400">{{ $t('public.estimateIndicative') }}</p>
              </div>

              <!-- Réserver → passe à la saisie des coordonnées -->
              <button type="button" class="btn-primary w-full" @click="goToContact">
                {{ reserveLabel }}
              </button>
            </template>
          </template>

          <!-- Étape 2 : coordonnées du client -->
          <template v-else>
            <!-- Rappel de la course estimée -->
            <div v-if="estimate" class="rounded-xl bg-slate-50 p-4">
              <div class="flex items-baseline justify-between">
                <span class="text-sm text-slate-600">{{ $t('public.estimateLabel') }}</span>
                <span class="font-serif text-2xl font-medium tracking-tight text-slate-900">
                  {{ formatMoney(estimate.amountCents, estimate.currency) }}
                </span>
              </div>
              <button
                type="button"
                class="-mb-2 mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-brand-700 hover:underline"
                @click="step = 'details'"
              >
                ← {{ $t('public.modifyTrip') }}
              </button>
            </div>

            <!-- Coordonnées client -->
            <div class="space-y-3">
              <div>
                <label class="label" for="name">{{ $t('public.nameLabel') }}</label>
                <input id="name" v-model="customer.name" type="text" class="field" required />
              </div>
              <!-- Empilés sur mobile : côte à côte, téléphone et email saisis seraient illisibles. -->
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="phone">{{ $t('public.phoneLabel') }}</label>
                  <input id="phone" v-model="customer.phone" type="tel" class="field" required />
                </div>
                <div>
                  <label class="label" for="email">{{ $t('public.emailLabel') }}</label>
                  <input id="email" v-model="customer.email" type="email" class="field" required />
                </div>
              </div>
              <div>
                <label class="label" for="notes">{{ $t('public.notesLabel') }}</label>
                <textarea id="notes" v-model="notes" rows="2" class="field" />
              </div>
            </div>

            <!-- Règlement : choix quand plusieurs options, simple rappel sinon -->
            <div v-if="paymentOptions.length > 1" class="space-y-2">
              <p class="label">{{ $t('public.paymentQuestion') }}</p>
              <label
                v-for="opt in paymentOptions"
                :key="opt.value"
                class="flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition"
                :class="selectedPayment === opt.value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-brand-200'"
              >
                <input v-model="selectedPayment" type="radio" :value="opt.value" class="mt-0.5" name="payment-choice" />
                <span class="flex-1">
                  <span class="text-sm font-medium text-slate-800">{{ opt.label }}</span>
                  <span class="mt-0.5 block text-xs text-slate-500">{{ opt.hint }}</span>
                </span>
              </label>
            </div>
            <p v-else-if="paymentOptions.length === 1" class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {{ paymentOptions[0]!.label }} · {{ paymentOptions[0]!.hint }}
            </p>

            <!-- CGV -->
            <label class="flex items-start gap-2.5 text-xs text-slate-600">
              <input v-model="cgvAccepted" type="checkbox" class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300" />
              <span>{{ $t('public.cgv') }}</span>
            </label>

            <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

            <button type="submit" class="btn-primary w-full" :disabled="!canSubmit || submitting">
              {{ submitting ? $t('public.submitting') : reserveLabel }}
            </button>
          </template>
        </form>
      </div>
    </div>

    <!-- Mention paiement sécurisé : uniquement si le paiement en ligne est proposé -->
    <p v-if="driver.bookingMode.onlineAvailable" class="mt-4 text-center text-xs text-slate-400">
      {{ $t('common.securePayment') }}
    </p>

    <!-- Lightbox véhicule (téléportée dans <body>) -->
    <AppModal v-if="zoomedVehicle" @close="zoomedVehicle = null">
      <div class="flex h-64 items-center justify-center rounded-xl bg-slate-50">
        <VehicleImage
          :make="zoomedVehicle.make"
          :model-family="zoomedVehicle.modelFamily"
          :vehicle-class="zoomedVehicle.vehicleClass"
          :color="zoomedVehicle.color"
          :photo-url="zoomedVehicle.photoSrc"
          :alt="zoomedVehicle.modelLabel"
          class="h-full w-full p-2"
        />
      </div>
      <p class="mt-4 text-center text-lg font-bold text-slate-900">{{ zoomedVehicle.modelLabel }}</p>
      <p class="text-center text-sm text-slate-500">
        <span v-if="zoomedVehicle.vehicleClass">{{ zoomedVehicle.vehicleClass }}</span>
        <span v-if="zoomedVehicle.seats"> · {{ zoomedVehicle.seats }} places</span>
        <span v-if="zoomedVehicle.color"> · {{ zoomedVehicle.color }}</span>
      </p>
      <div class="mt-5 flex justify-end">
        <button class="btn-ghost" @click="zoomedVehicle = null">Fermer</button>
      </div>
    </AppModal>
  </div>
</template>
