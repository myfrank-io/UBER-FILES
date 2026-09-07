<script setup lang="ts">
// Page publique de réservation d'un chauffeur (marque blanche, mobile-first).
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'
import { timezoneLabel } from '~/lib/datetime'
import {
  AIRPORT_HUB_LABELS,
  airportPackageCents,
  type AirportRates,
  type AirportSelection,
  type AirportZone,
} from '~/lib/airport'
import { detectAirportRide } from '~/lib/airport-detect'
import { findHubByText, findTerminal } from '~/lib/hubs'

const route = useRoute()
const slug = route.params.slug as string
const { formatMoney } = useFormat()
const { t, locale } = useI18n()

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
  // Fuseau du lieu de prise en charge : l'heure saisie y est ancrée (pas au navigateur).
  timezone: string
  minimumFareCents: number
  minLeadTimeMinutes: number
  hasTransfer: boolean
  bookingEnabled: boolean
  hasHourly: boolean
  // Durée minimale d'une mise à disposition (null/absent = aucune). Optionnel :
  // un payload public encore en cache CDN peut ne pas porter le champ.
  hourlyMinHours?: number | null
  // Transferts aéroport : grille des forfaits (affichés avant toute saisie).
  // Optionnel : un payload public encore en cache CDN peut ne pas porter le champ.
  airportTransfer?: { enabled: boolean; rates: AirportRates }
  // Majoration appliquée aux réservations faites moins de X minutes avant le départ.
  lastMinuteSurcharge: { maxLeadTimeMinutes: number; amountCents: number } | null
  // Supplément selon le nombre de personnes (null = non proposé). thirdCents /
  // fourthCents sont cumulatifs ; maxPassengers borne le sélecteur (capacité flotte).
  passengerSurcharge?: {
    thirdCents: number | null
    fourthCents: number | null
    maxPassengers: number
  } | null
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
// Deux prestations : les courses (trajet A → B, transferts aéroport compris) et
// la mise à disposition. Le transfert aéroport n'a plus d'onglet : il est reconnu
// automatiquement dès qu'une des deux adresses est un aéroport tarifé.
type BookingType = 'TRANSFER' | 'HOURLY'
function computeAvailableTypes(d: DriverPublic | null | undefined): BookingType[] {
  if (!d) return ['TRANSFER']
  const list: BookingType[] = []
  // Une grille kilométrique OU des forfaits aéroport suffisent à proposer des courses.
  if (d.hasTransfer || d.airportTransfer?.enabled) list.push('TRANSFER')
  if (d.hasHourly) list.push('HOURLY')
  return list.length ? list : ['TRANSFER']
}
const availableTypes = computed(() => computeAvailableTypes(driver.value))
const type = ref<BookingType>(computeAvailableTypes(driver.value)[0]!)
const pickup = ref('')
const dropoff = ref('')
// Coordonnées exactes résolues à la sélection d'une suggestion (placeId → Place
// Details). null tant que l'utilisateur tape librement → repli géocodage du texte.
const pickupCoords = ref<{ lat: number; lng: number } | null>(null)
const dropoffCoords = ref<{ lat: number; lng: number } | null>(null)
// Terminal/hall choisi (hubs) + coords précises de ce terminal, aux deux bouts.
const pickupTerminal = ref<string | null>(null)
const terminalCoords = ref<{ lat: number; lng: number } | null>(null)
const dropoffTerminal = ref<string | null>(null)
const dropoffTerminalCoords = ref<{ lat: number; lng: number } | null>(null)
const roundTrip = ref(false)
const durationHours = ref(2)
// Durée minimale acceptée par le chauffeur (« je ne me déplace pas pour moins de
// 2 h »). 1 par défaut = aucune contrainte. Le serveur revalide de son côté :
// cette borne rend juste le refus impossible à atteindre depuis le formulaire.
const minDurationHours = computed(() => Math.max(1, driver.value?.hourlyMinHours ?? 1))
// La durée proposée ne descend jamais sous ce minimum : le formulaire s'ouvre
// directement sur une valeur commandable, plutôt que sur un champ à corriger.
watch(minDurationHours, (min) => {
  if (durationHours.value < min) durationHours.value = min
}, { immediate: true })
// N° de vol : demandé uniquement sur un transfert aéroport reconnu.
const airportFlight = ref('')

// ─── Nombre de personnes (supplément 3e / 4e personne) ───
// Le sélecteur n'apparaît (étape course) que si le chauffeur a configuré un
// supplément. Le prix se recalcule côté serveur à chaque changement — l'aperçu
// client ci-dessous n'est qu'informatif.
const passengerConfig = computed(() => driver.value?.passengerSurcharge ?? null)
const maxPassengers = computed(() => passengerConfig.value?.maxPassengers ?? 4)
const passengers = ref(1)

// Supplément (centimes) pour un nombre de personnes donné — miroir exact du
// barème serveur (cumulatif : 3e puis 4e personne, rien avant 3 ni après 4).
function passengerSurchargeCents(count: number): number {
  const c = passengerConfig.value
  if (!c) return 0
  let sum = 0
  if (count >= 3 && c.thirdCents) sum += c.thirdCents
  if (count >= 4 && c.fourthCents) sum += c.fourthCents
  return sum
}

// ─── Transfert aéroport : reconnu, plus déclaré ───
// Le client saisit simplement son départ et son arrivée. Dès qu'un des deux bouts
// est un aéroport tarifé par le chauffeur, le forfait de la zone (ou le prix au km
// hors Paris) remplace la grille kilométrique, et l'écran s'enrichit de ce qui est
// propre à l'aéroport : forfait annoncé, contenu de la prestation, n° de vol.
// Même fonction de détection que le serveur (lib/airport-detect) — mais c'est
// TOUJOURS le calcul serveur qui fait foi : ici, on ne fait qu'anticiper l'affichage.
const airportRates = computed(() => driver.value?.airportTransfer?.rates ?? null)

// Un bout de trajet = son texte + les coordonnées les plus précises dont on dispose
// (terminal choisi > lieu résolu dans l'autocomplétion).
const pickupPoint = computed(() => ({
  address: pickup.value,
  coords: terminalCoords.value ?? pickupCoords.value,
}))
const dropoffPoint = computed(() => ({
  address: dropoff.value,
  coords: dropoffTerminalCoords.value ?? dropoffCoords.value,
}))

const airportRide = computed(() =>
  type.value === 'TRANSFER'
    ? detectAirportRide({
        rates: airportRates.value,
        pickup: pickupPoint.value,
        dropoff: dropoffPoint.value,
      })
    : null,
)
const airportSelection = computed<AirportSelection | null>(() => airportRide.value?.selection ?? null)

// Forfait applicable (null hors Paris : tarifé au km, prix connu après calcul).
const airportPackagePrice = computed(() =>
  airportRates.value && airportSelection.value
    ? airportPackageCents(
        airportRates.value,
        airportSelection.value.hub,
        airportSelection.value.zone,
      )
    : null,
)

// Un forfait aéroport couvre un trajet simple : l'aller-retour n'a pas de sens ici
// (le client réserve deux courses). La case disparaît, et on la décoche au cas où
// elle aurait été cochée avant la saisie des adresses.
watch(airportRide, (ride) => {
  if (ride) roundTrip.value = false
})

function typeTabLabel(bt: BookingType): string {
  return bt === 'TRANSFER' ? t('public.typeRides') : t('public.typeHourly')
}

const airportZoneNames: Record<AirportZone, () => string> = {
  RIVE_DROITE: () => t('public.airportZoneRight'),
  RIVE_GAUCHE: () => t('public.airportZoneLeft'),
  HORS_PARIS: () => t('public.airportZoneOutside'),
}

// « Orly → Paris rive gauche » : le trajet reconnu, dans le sens du déplacement.
const airportRouteLabel = computed(() => {
  const selection = airportSelection.value
  if (!selection) return ''
  const hub = AIRPORT_HUB_LABELS[selection.hub]
  const zone = airportZoneNames[selection.zone]()
  return selection.direction === 'FROM_AIRPORT' ? `${hub} → ${zone}` : `${zone} → ${hub}`
})

// Terminal d'arrivée : il n'existe pas de colonne dédiée côté demande (seul le
// terminal de PRISE EN CHARGE est stocké), on l'ajoute donc au libellé de l'adresse.
const dropoffTerminalData = computed(() => {
  const hub = findHubByText(dropoff.value)
  return hub ? findTerminal(hub, dropoffTerminal.value) : null
})
const dropoffAddressLabel = computed(() =>
  dropoffTerminalData.value ? `${dropoff.value} · ${dropoffTerminalData.value.label}` : dropoff.value,
)
// Fuseau du lieu de prise en charge (chauffeur). TOUTE heure saisie/affichée est
// ancrée dessus, jamais sur le fuseau du navigateur du client — sinon un client
// dans un autre fuseau (ex : Antilles) verrait/enverrait une heure décalée.
// Déclaré AVANT `scheduledAt` : sa valeur initiale (defaultDateTime → toDriverLocalInput)
// lit déjà `driverTz`. Placé après, l'accès tomberait en zone morte (TDZ) et
// planterait tout le rendu de la page (« Cannot access 'driverTz' before initialization »).
const driverTz = computed(() => driver.value?.timezone ?? 'Europe/Paris')
const tzHint = computed(() => timezoneLabel(driverTz.value, locale.value === 'en' ? 'en' : 'fr'))
const scheduledAt = ref(defaultDateTime())
const customer = reactive({ name: '', phone: '', email: '' })
const notes = ref('')
const cgvAccepted = ref(false)

// Un instant (Date UTC) → chaîne « yyyy-MM-ddTHH:mm » pour <input datetime-local>,
// exprimée dans le fuseau du chauffeur (l'input, lui, n'a pas de notion de fuseau).
function toDriverLocalInput(d: Date): string {
  return formatInTimeZone(d, driverTz.value, "yyyy-MM-dd'T'HH:mm")
}

// L'heure murale saisie (sans fuseau) → instant UTC, interprétée dans le fuseau
// du chauffeur. C'est ce qui corrige le bug : « 11:30 » = 11:30 sur le lieu.
function driverLocalToInstant(local: string): Date {
  return fromZonedTime(local, driverTz.value)
}

function defaultDateTime(): string {
  const leadMs = (driver.value?.minLeadTimeMinutes ?? 180) * 60_000
  const d = new Date(Date.now() + Math.max(leadMs, 3 * 3600_000))
  d.setMinutes(0, 0, 0)
  // L'arrondi à l'heure ne doit pas retomber sous le délai minimum.
  if (d.getTime() < Date.now() + leadMs) d.setTime(d.getTime() + 3600_000)
  return toDriverLocalInput(d)
}

// Borne basse du sélecteur : impossible de choisir une date déjà passée ou sous le
// délai minimum de réservation (l'erreur n'apparaissait sinon qu'à l'estimation).
const minScheduledAt = computed(() =>
  toDriverLocalInput(new Date(Date.now() + (driver.value?.minLeadTimeMinutes ?? 0) * 60_000)),
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
  const leadMs = driverLocalToInstant(scheduledAt.value).getTime() - Date.now()
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
// on ne peut pas réserver sur un prix périmé. Les terminaux en font partie (ils
// déplacent le point de prise en charge, donc la distance facturée).
watch(
  [type, pickup, dropoff, pickupTerminal, dropoffTerminal, roundTrip, durationHours, scheduledAt],
  () => {
    estimate.value = null
    step.value = 'details'
  },
)

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
  // L'heure murale choisie est interprétée dans le fuseau du chauffeur (lieu de
  // prise en charge), puis envoyée au serveur en ISO UTC.
  return driverLocalToInstant(scheduledAt.value).toISOString()
}

async function buildPayload() {
  const base: Record<string, unknown> = { type: type.value, scheduledAt: isoScheduledAt() }
  if (passengerConfig.value) base.passengers = passengers.value
  // Le terminal choisi (hub) fournit la coordonnée de prise en charge la plus précise.
  if (pickupTerminal.value) base.pickupTerminal = pickupTerminal.value
  if (type.value === 'TRANSFER') {
    const [p, d] = await Promise.all([
      resolveCoords(pickup.value, pickupPoint.value.coords),
      resolveCoords(dropoff.value, dropoffPoint.value.coords),
    ])
    base.pickup = p
    base.dropoff = d
    // Les adresses en clair partent avec les coordonnées : le serveur s'en sert
    // pour reconnaître le transfert aéroport et sa zone (code postal parisien).
    base.pickupAddress = pickup.value
    base.dropoffAddress = dropoffAddressLabel.value
    base.roundTrip = roundTrip.value
    if (airportRide.value && airportFlight.value.trim()) {
      base.flightNumber = airportFlight.value.trim().slice(0, 16)
    }
  } else {
    // Mise à disposition : le lieu de prise en charge est requis aussi.
    base.pickup = await resolveCoords(pickup.value, pickupPoint.value.coords)
    base.pickupAddress = pickup.value
    base.durationHours = durationHours.value
  }
  return base
}

// Amène le résultat (et le bouton « Réserver ») dans le viewport : sur mobile,
// l'estimation apparaît sinon sous la ligne de flottaison sans aucun indice.
const estimateBox = ref<HTMLElement | null>(null)

// `silent` : recalcul en place (changement du nombre de personnes à l'étape
// coordonnées) — on ne vide pas le prix affiché et on ne refait pas défiler.
async function getEstimate({ silent = false }: { silent?: boolean } = {}) {
  errorMsg.value = ''
  estimating.value = true
  if (!silent) estimate.value = null
  try {
    const payload = await buildPayload()
    estimate.value = await $fetch(`/api/public/${slug}/estimate`, { method: 'POST', body: payload })
    if (!silent) {
      await nextTick()
      // 'nearest' : ne défile que si le résultat est réellement hors écran.
      estimateBox.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  } catch (e) {
    errorMsg.value = errMessage(e)
  } finally {
    estimating.value = false
  }
}

// Changement du nombre de personnes : le prix (supplément 3e/4e personne inclus)
// est recalculé en place, sans quitter l'étape coordonnées ni masquer le montant.
watch(passengers, () => {
  if (estimate.value) getEstimate({ silent: true })
})

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
    : pickup.value.length > 3 && durationHours.value >= minDurationHours.value,
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

// Libellé de l'encadré de prix : « Prix du trajet » quand c'est le forfait
// aéroport tel quel (prix fixe, pas une estimation), « Estimation » sinon.
const estimateBoxLabel = computed(() =>
  airportPackagePrice.value != null && estimate.value?.amountCents === airportPackagePrice.value
    ? t('public.airportPriceLabel')
    : t('public.estimateLabel'),
)

// ─── Bouton principal de l'étape 1 ───
// Forfait aéroport reconnu : « Réserver — 65,00 € » en un seul geste — le prix est
// déjà connu, autant l'annoncer. Le calcul serveur est tout de même vérifié au
// clic ; s'il diffère du forfait (majoration dernière minute…), le détail s'affiche
// d'abord pour que le client valide en connaissance de cause.
// Sinon (course classique, ou aéroport hors Paris tarifé au km) : « Estimer le prix ».
const priceCtaLabel = computed(() => {
  if (estimating.value) return t('public.estimating')
  if (airportPackagePrice.value != null && driver.value) {
    return `${reserveLabel.value} — ${formatMoney(airportPackagePrice.value, driver.value.currency)}`
  }
  return airportRide.value ? t('public.airportSeePrice') : t('public.estimateButton')
})

async function priceCtaClick() {
  await getEstimate()
  if (!estimate.value) return
  // Le montant annoncé sur le bouton est confirmé par le serveur : on enchaîne
  // directement sur les coordonnées, sans faire relire un prix déjà lu.
  if (
    airportPackagePrice.value != null &&
    estimate.value.amountCents === airportPackagePrice.value
  ) {
    goToContact()
  }
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
            <!-- Type de prestation — les courses d'abord (transferts aéroport
                 compris), puis la mise à disposition ; sélecteur masqué quand une
                 seule prestation est proposée. -->
            <div
              v-if="availableTypes.length > 1"
              class="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
            >
              <button
                v-for="bt in availableTypes"
                :key="bt"
                type="button"
                class="whitespace-nowrap rounded-lg px-1.5 py-2.5 text-[13px] font-semibold transition sm:text-sm"
                :class="type === bt ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                :aria-pressed="type === bt"
                @click="type = bt"
              >
                {{ typeTabLabel(bt) }}
              </button>
            </div>

            <!-- Course : départ → arrivée. Si l'un des deux bouts est un aéroport
                 tarifé, le forfait s'applique et le bloc aéroport apparaît. -->
            <template v-if="type === 'TRANSFER'">
              <div>
                <label class="label" for="pickup">{{ $t('public.pickupLabel') }}</label>
                <AddressField id="pickup" v-model="pickup" :placeholder="$t('public.pickupPlaceholder')" @resolve="pickupCoords = $event" />
                <TerminalPicker class="mt-3" :address="pickup" v-model="pickupTerminal" @coords="terminalCoords = $event" />
              </div>
              <div>
                <label class="label" for="dropoff">{{ $t('public.dropoffLabel') }}</label>
                <AddressField id="dropoff" v-model="dropoff" :placeholder="$t('public.dropoffPlaceholder')" @resolve="dropoffCoords = $event" />
                <TerminalPicker
                  class="mt-3"
                  :address="dropoff"
                  v-model="dropoffTerminal"
                  arrival
                  @coords="dropoffTerminalCoords = $event"
                />
              </div>

              <!-- Transfert aéroport reconnu : le client n'a rien eu à déclarer.
                   Tout ce qui est propre à l'aéroport tient dans ce seul bloc —
                   trajet, prix, contenu du forfait, n° de vol. -->
              <div v-if="airportRide" class="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                      ✈️ {{ $t('public.airportDetected') }}
                    </p>
                    <p class="mt-0.5 text-sm font-semibold leading-snug text-slate-900">{{ airportRouteLabel }}</p>
                  </div>
                  <span class="shrink-0 text-right">
                    <template v-if="airportPackagePrice != null">
                      <span class="block font-serif text-xl font-medium tracking-tight text-slate-900">
                        {{ formatMoney(airportPackagePrice, driver.currency) }}
                      </span>
                      <span class="block text-[10px] font-semibold uppercase tracking-wide text-green-700">
                        {{ $t('public.airportFixedPrice') }}
                      </span>
                    </template>
                    <span v-else-if="airportRates?.kmRateCents" class="block font-serif text-xl font-medium tracking-tight text-slate-900">
                      {{ formatMoney(airportRates.kmRateCents, driver.currency) }}<span class="font-sans text-xs text-slate-500">/km</span>
                    </span>
                  </span>
                </div>

                <!-- Ce que comprend la prestation : annoncé avant de réserver,
                     pas découvert le jour de la course. -->
                <ul class="space-y-1.5 border-t border-brand-200/70 pt-3 text-xs leading-snug text-slate-600">
                  <li class="flex gap-2">
                    <span aria-hidden="true">👥</span><span>{{ $t('public.airportIncludedPassengers') }}</span>
                  </li>
                  <li class="flex gap-2">
                    <span aria-hidden="true">🧳</span><span>{{ $t('public.airportIncludedLuggage') }}</span>
                  </li>
                  <li class="flex gap-2">
                    <span aria-hidden="true">🚫</span><span>{{ $t('public.airportIncludedNoTrunk') }}</span>
                  </li>
                  <li class="flex gap-2">
                    <span aria-hidden="true">⏱</span><span>{{ $t('public.airportWaitingNotice') }}</span>
                  </li>
                </ul>

                <div class="border-t border-brand-200/70 pt-3">
                  <label class="label" for="airport-flight">
                    {{ $t('public.airportFlightLabel') }}
                    <span class="font-normal text-slate-400">{{ $t('public.airportOptional') }}</span>
                  </label>
                  <input
                    id="airport-flight"
                    v-model="airportFlight"
                    type="text"
                    class="field"
                    maxlength="16"
                    placeholder="AF 1234"
                    autocapitalize="characters"
                  />
                  <p class="mt-1 text-xs text-slate-500">{{ $t('public.airportFlightHint') }}</p>
                </div>
              </div>

              <!-- Course classique : rien qui parle d'aéroport tant qu'aucun des deux
                   bouts n'en est un. L'aller-retour, lui, n'existe qu'ici. -->
              <label v-else class="flex items-center gap-2.5 py-1 text-sm text-slate-700">
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
                <input
                  id="duration"
                  v-model.number="durationHours"
                  type="number"
                  :min="minDurationHours"
                  max="24"
                  class="field"
                />
                <p v-if="minDurationHours > 1" class="mt-1 text-xs text-slate-500">
                  {{ $t('public.durationMin', { hours: minDurationHours }) }}
                </p>
              </div>
            </template>

            <div>
              <label class="label" for="datetime">
                {{ $t('public.datetimeLabel') }}
                <span class="font-normal text-slate-400">({{ tzHint }})</span>
              </label>
              <input id="datetime" v-model="scheduledAt" type="datetime-local" class="field" :min="minScheduledAt" />
              <p class="mt-1 text-xs text-slate-500">
                {{ $t('public.leadTime', { hours: Math.round(driver.minLeadTimeMinutes / 60) }) }}
              </p>
              <!-- Majoration dernière minute : annoncée avant même l'estimation. -->
              <p v-if="lastMinuteNotice" class="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                ⏱ {{ lastMinuteNotice }}
              </p>
            </div>

            <!-- Nombre de personnes — dernier réglage, en version discrète : c'est un
                 ajustement, pas une décision. Une seule personne dans l'immense
                 majorité des cas, et le tarif ne bouge qu'à partir de la troisième.
                 N'apparaît que si le chauffeur facture un supplément 3e / 4e personne. -->
            <div v-if="passengerConfig">
              <div class="flex items-center justify-between gap-3">
                <!-- Pas de rappel « forfait pour 2 personnes » ici : le bloc aéroport
                     le dit déjà juste au-dessus. -->
                <span class="text-xs text-slate-500">{{ $t('public.passengersLabel') }}</span>
                <div class="inline-flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-200">
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center text-base font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                    :disabled="passengers <= 1"
                    :aria-label="$t('public.passengersDecrease')"
                    @click="passengers = Math.max(1, passengers - 1)"
                  >
                    −
                  </button>
                  <span class="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-slate-900" aria-live="polite">
                    {{ passengers }}
                  </span>
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center text-base font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                    :disabled="passengers >= maxPassengers"
                    :aria-label="$t('public.passengersIncrease')"
                    @click="passengers = Math.min(maxPassengers, passengers + 1)"
                  >
                    ＋
                  </button>
                </div>
              </div>
              <p
                v-if="passengerSurchargeCents(passengers) > 0"
                class="mt-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800"
              >
                ＋ {{ $t('public.passengersSurchargeNotice', { count: passengers, amount: formatMoney(passengerSurchargeCents(passengers), driver.currency) }) }}
              </p>
            </div>

            <!-- Bouton principal — masqué dès qu'un prix est affiché (toute
                 modification de la course le réinitialise et le fait réapparaître).
                 Au forfait aéroport il porte directement le montant et enchaîne sur
                 les coordonnées ; sinon il estime le prix. -->
            <button
              v-if="!estimate"
              type="button"
              class="w-full"
              :class="airportPackagePrice != null ? 'btn-primary' : 'btn-ghost'"
              :disabled="!canEstimate || estimating"
              @click="priceCtaClick"
            >
              {{ priceCtaLabel }}
            </button>

            <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

            <template v-if="estimate">
              <div ref="estimateBox" class="scroll-mt-4 rounded-xl bg-slate-50 p-4">
                <div class="flex items-baseline justify-between">
                  <span class="text-sm text-slate-600">{{ estimateBoxLabel }}</span>
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
                <span class="text-sm text-slate-600">{{ estimateBoxLabel }}</span>
                <span
                  class="font-serif text-2xl font-medium tracking-tight text-slate-900 transition-opacity"
                  :class="{ 'opacity-40': estimating }"
                >
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
