// Parcours de configuration guidée (/configuration).
//
// Logique PURE et testée (aucune I/O) : à partir d'un instantané du compte
// chauffeur, décide quelles étapes s'affichent, lesquelles sont déjà faites
// (et donc sautées), et laquelle vient ensuite. La présentation vit dans
// pages/configuration/index.vue et components/setup/*.
//
// Deux familles d'étapes :
//  - déduites de la donnée (photo présente, véhicule enregistré, SumUp
//    connecté…) : faites dès que l'information existe, quelle que soit la
//    façon dont elle a été saisie (parcours, dashboard, admin) ;
//  - « à valider » (tarifs, annulation, paiement) : ces réglages ont des
//    valeurs par défaut dès la création du compte, on ne peut donc pas déduire
//    de la donnée seule que le chauffeur les a relus. Elles sont faites quand
//    il les a explicitement confirmées dans le parcours (`confirmed`).
import { fromZonedTime } from 'date-fns-tz'
import type { PaymentMethod } from './payment-methods'
import { priceHourly, priceTransfer, PricingError, type PriceResult, type TransferRateBandInput } from './pricing'

export type SetupStepKey =
  | 'identite'
  | 'contact'
  | 'vehicule'
  | 'tarifs'
  | 'annulation'
  | 'paiement'
  | 'encaissement'
  | 'google'
  | 'telegram'
  | 'carte'
  | 'acces'
  | 'recap'

/** Ordre d'affichage du parcours. */
export const SETUP_STEP_ORDER: SetupStepKey[] = [
  'identite',
  'contact',
  'vehicule',
  'tarifs',
  'annulation',
  'paiement',
  'encaissement',
  'google',
  'telegram',
  'carte',
  'acces',
  'recap',
]

/** Libellés lisibles des étapes (récapitulatif chauffeur, fiche admin). */
export const SETUP_STEP_LABELS: Record<SetupStepKey, string> = {
  identite: 'Nom, accroche et photo',
  contact: 'Téléphone et email',
  vehicule: 'Véhicule',
  tarifs: 'Tarifs',
  annulation: 'Conditions d’annulation',
  paiement: 'Moyens de paiement',
  encaissement: 'Encaissement en ligne (SumUp)',
  google: 'Avis Google',
  telegram: 'Notifications Telegram',
  carte: 'Carte de visite digitale',
  acces: 'Mot de passe',
  recap: 'Récapitulatif',
}

/** Étapes qui ne sont faites qu'une fois confirmées par le chauffeur. */
export const CONFIRMABLE_STEPS: SetupStepKey[] = ['tarifs', 'annulation', 'paiement', 'acces']

export interface SetupSnapshot {
  hasPhoto: boolean
  hasIntro: boolean
  hasPhone: boolean
  vehicleCount: number
  hasRates: boolean
  paymentMethods: PaymentMethod[]
  /** SumUp ou Stripe opérationnel. */
  onlinePayoutReady: boolean
  /** Fiche Google connectée OU lien d'avis manuel. */
  reviewLinkReady: boolean
  telegramLinked: boolean
  cardPublished: boolean
  /** Le compte n'a pas encore de mot de passe choisi (invitation non consommée). */
  needsPassword: boolean
  /** La session courante a été ouverte par le lien de configuration. */
  setupSession: boolean
  /** Étapes confirmées par le chauffeur dans le parcours. */
  confirmed: string[]
}

export interface SetupStep {
  key: SetupStepKey
  /** Étape présente dans le parcours (ex. encaissement seulement si paiement en ligne). */
  applicable: boolean
  done: boolean
  /** N'entre pas dans le calcul de progression. */
  optional: boolean
}

export interface SetupResult {
  steps: SetupStep[]
  requiredDone: number
  requiredTotal: number
  /** 0–100 sur les seules étapes obligatoires applicables. */
  percent: number
  complete: boolean
}

export function computeSetup(snap: SetupSnapshot): SetupResult {
  const confirmed = new Set(snap.confirmed)
  const requiresOnline = snap.paymentMethods.includes('STRIPE_PREPAYMENT')
  // Mot de passe : proposé aux sessions ouvertes par le lien tant que le compte
  // n'en a pas ; reste visible (fait) une fois choisi dans ce même parcours.
  const accesApplicable = snap.setupSession && (snap.needsPassword || confirmed.has('acces'))

  const steps: SetupStep[] = [
    { key: 'identite', applicable: true, done: snap.hasPhoto && snap.hasIntro, optional: false },
    { key: 'contact', applicable: true, done: snap.hasPhone, optional: false },
    { key: 'vehicule', applicable: true, done: snap.vehicleCount > 0, optional: false },
    { key: 'tarifs', applicable: true, done: snap.hasRates && confirmed.has('tarifs'), optional: false },
    { key: 'annulation', applicable: true, done: confirmed.has('annulation'), optional: false },
    {
      key: 'paiement',
      applicable: true,
      done: snap.paymentMethods.length > 0 && confirmed.has('paiement'),
      optional: false,
    },
    { key: 'encaissement', applicable: requiresOnline, done: snap.onlinePayoutReady, optional: false },
    { key: 'google', applicable: true, done: snap.reviewLinkReady, optional: true },
    { key: 'telegram', applicable: true, done: snap.telegramLinked, optional: true },
    { key: 'carte', applicable: true, done: snap.cardPublished, optional: true },
    { key: 'acces', applicable: accesApplicable, done: confirmed.has('acces'), optional: false },
    { key: 'recap', applicable: true, done: false, optional: true },
  ]

  const required = steps.filter((s) => s.applicable && !s.optional)
  const requiredDone = required.filter((s) => s.done).length
  const requiredTotal = required.length
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100)

  return { steps, requiredDone, requiredTotal, percent, complete: requiredDone === requiredTotal }
}

/** Étapes réellement affichées, dans l'ordre. */
export function visibleSteps(result: SetupResult): SetupStep[] {
  return result.steps.filter((s) => s.applicable)
}

/**
 * Prochaine étape à montrer après `current` : la première étape applicable
 * non faite qui la suit (les étapes déjà faites sont sautées). À défaut, le
 * récapitulatif.
 */
export function nextStepAfter(result: SetupResult, current: SetupStepKey): SetupStepKey {
  const steps = visibleSteps(result)
  const idx = steps.findIndex((s) => s.key === current)
  for (const s of steps.slice(idx + 1)) {
    if (s.key === 'recap') break
    if (!s.done) return s.key
  }
  return 'recap'
}

/** Première étape non faite (là où reprendre le parcours). */
export function firstIncompleteStep(result: SetupResult): SetupStepKey {
  for (const s of visibleSteps(result)) {
    if (s.key === 'recap') break
    if (!s.done) return s.key
  }
  return 'recap'
}

/** Étape visible précédant `current` (navigation « Retour »), ou null. */
export function previousStep(result: SetupResult, current: SetupStepKey): SetupStepKey | null {
  const steps = visibleSteps(result)
  const idx = steps.findIndex((s) => s.key === current)
  return idx > 0 ? steps[idx - 1].key : null
}

// ─── Tarifs « simples » (jour / nuit) ────────────────────────────────────────

export interface SimpleRates {
  dayPerKmCents: number
  /** null = pas de tarif de nuit (prix unique). */
  nightPerKmCents: number | null
  /** Début de la nuit, minute dans la journée (ex. 1320 = 22h00). */
  nightStartMinute: number
  /** Fin de la nuit, minute dans la journée (ex. 360 = 06h00). */
  nightEndMinute: number
}

interface BandLike {
  pricePerKmCents: number
  daysOfWeek: number[]
  startMinute: number
  endMinute: number
  priority: number
  isDefault: boolean
  tiers?: { uptoKm: number | null; pricePerKmCents: number }[] | null
}

/**
 * Reconnaît une grille « simple » : un tarif de jour (bande de repli) et, en
 * option, un tarif de nuit sur une plage horaire, tous les jours, sans paliers
 * dégressifs. Toute autre configuration (jours spécifiques, paliers, plus de
 * deux bandes) est « avancée » : le parcours l'affiche sans la réécrire.
 */
export function detectSimpleRates(bands: BandLike[]): SimpleRates | null {
  if (bands.length === 0 || bands.length > 2) return null
  if (bands.some((b) => b.daysOfWeek.length > 0 || (b.tiers?.length ?? 0) > 0)) return null

  if (bands.length === 1) {
    return {
      dayPerKmCents: bands[0].pricePerKmCents,
      nightPerKmCents: null,
      nightStartMinute: 1320,
      nightEndMinute: 360,
    }
  }

  const day = bands.find((b) => b.isDefault)
  const night = bands.find((b) => !b.isDefault)
  if (!day || !night) return null
  // La nuit doit primer sur le jour quand les deux couvrent l'heure demandée.
  if (night.priority < day.priority) return null
  return {
    dayPerKmCents: day.pricePerKmCents,
    nightPerKmCents: night.pricePerKmCents,
    nightStartMinute: night.startMinute,
    nightEndMinute: night.endMinute % 1440,
  }
}

export interface SimpleBandSpec {
  name: string
  pricePerKmCents: number
  daysOfWeek: number[]
  startMinute: number
  endMinute: number
  priority: number
  isDefault: boolean
}

/** Bandes à enregistrer pour une grille simple (remplacement intégral). */
export function simpleRateBands(r: SimpleRates): SimpleBandSpec[] {
  if (r.nightPerKmCents == null) {
    return [
      {
        name: 'Jour',
        pricePerKmCents: r.dayPerKmCents,
        daysOfWeek: [],
        startMinute: 0,
        endMinute: 1440,
        priority: 1,
        isDefault: true,
      },
    ]
  }
  const nightEnd =
    r.nightEndMinute <= r.nightStartMinute ? r.nightEndMinute + 1440 : r.nightEndMinute
  return [
    {
      name: 'Jour',
      pricePerKmCents: r.dayPerKmCents,
      daysOfWeek: [],
      // Bande de repli : couvre tout ce que la nuit ne couvre pas.
      startMinute: 0,
      endMinute: 1440,
      priority: 1,
      isDefault: true,
    },
    {
      name: 'Nuit',
      pricePerKmCents: r.nightPerKmCents,
      daysOfWeek: [],
      startMinute: r.nightStartMinute,
      endMinute: nightEnd,
      priority: 2,
      isDefault: false,
    },
  ]
}

// ─── Préréglages ─────────────────────────────────────────────────────────────

export interface RatePreset {
  key: 'standard' | 'premium'
  label: string
  description: string
  dayPerKmCents: number
  nightPerKmCents: number
  minimumFareCents: number
  hourlyRateCents: number
  airport: {
    orlyRiveDroiteCents: number
    orlyRiveGaucheCents: number
    cdgRiveDroiteCents: number
    cdgRiveGaucheCents: number
    kmRateCents: number
  }
}

/** Points de départ réalistes (Île-de-France, 2026) — le chauffeur ajuste ensuite. */
export const RATE_PRESETS: RatePreset[] = [
  {
    key: 'standard',
    label: 'Standard',
    description: 'Berline confort, tarifs dans la moyenne du marché.',
    dayPerKmCents: 200,
    nightPerKmCents: 250,
    minimumFareCents: 2500,
    hourlyRateCents: 5500,
    airport: {
      orlyRiveDroiteCents: 6000,
      orlyRiveGaucheCents: 5500,
      cdgRiveDroiteCents: 7000,
      cdgRiveGaucheCents: 7500,
      kmRateCents: 200,
    },
  },
  {
    key: 'premium',
    label: 'Premium',
    description: 'Van ou berline haut de gamme, prestation soignée.',
    dayPerKmCents: 260,
    nightPerKmCents: 320,
    minimumFareCents: 3500,
    hourlyRateCents: 7500,
    airport: {
      orlyRiveDroiteCents: 8000,
      orlyRiveGaucheCents: 7500,
      cdgRiveDroiteCents: 9500,
      cdgRiveGaucheCents: 10000,
      kmRateCents: 260,
    },
  },
]

// ─── Simulateur ──────────────────────────────────────────────────────────────

export interface SimulationScenario {
  key: string
  label: string
  /** Description courte du moment (« mardi 10h »). */
  when: string
  distanceKm: number
  /** Heure locale (Europe/Paris) utilisée pour choisir la bande. */
  localDateTime: string
}

/** Trajets types, parlants pour un chauffeur parisien. */
export const TRANSFER_SCENARIOS: SimulationScenario[] = [
  { key: 'centre', label: 'Opéra → La Défense', when: 'mardi 10h', distanceKm: 11, localDateTime: '2026-09-08 10:00' },
  { key: 'banlieue', label: 'Gare de Lyon → Versailles', when: 'vendredi 18h', distanceKm: 24, localDateTime: '2026-09-11 18:00' },
  { key: 'nuit', label: 'Bastille → Neuilly', when: 'samedi 23h30', distanceKm: 12, localDateTime: '2026-09-12 23:30' },
]

const DEFAULT_TZ = 'Europe/Paris'

export interface SimulationOutcome {
  amountCents: number
  /** Nom de la bande retenue (« Jour », « Nuit ») ou null en cas d'erreur. */
  bandName: string | null
  error: string | null
}

/** Prix d'un transfert type avec des bandes quelconques (grille avancée). */
export function simulateTransferWithBands(
  bands: TransferRateBandInput[],
  scenario: Pick<SimulationScenario, 'distanceKm' | 'localDateTime'>,
  minimumFareCents: number,
  currency = 'eur',
  timezone = DEFAULT_TZ,
): SimulationOutcome {
  try {
    const result: PriceResult = priceTransfer({
      distanceMeters: Math.round(scenario.distanceKm * 1000),
      scheduledAt: fromZonedTime(scenario.localDateTime, timezone),
      roundTrip: false,
      bands,
      surcharges: [],
      params: { currency, minimumFareCents, timezone },
    })
    const first = result.breakdown[0]?.label ?? ''
    const bandName = first.includes('—') ? first.split('—')[1].trim() : null
    return { amountCents: result.amountCents, bandName, error: null }
  } catch (e) {
    return {
      amountCents: 0,
      bandName: null,
      error: e instanceof PricingError ? e.message : 'Calcul impossible.',
    }
  }
}

/** Prix d'un transfert type avec la grille simple donnée. */
export function simulateTransfer(
  rates: SimpleRates,
  scenario: Pick<SimulationScenario, 'distanceKm' | 'localDateTime'>,
  minimumFareCents: number,
  currency = 'eur',
  timezone = DEFAULT_TZ,
): SimulationOutcome {
  const bands: TransferRateBandInput[] = simpleRateBands(rates).map((b) => ({ ...b, tiers: [] }))
  return simulateTransferWithBands(bands, scenario, minimumFareCents, currency, timezone)
}

/** Prix d'une mise à disposition de `hours` heures au tarif horaire donné. */
export function simulateHourly(
  pricePerHourCents: number,
  hours: number,
  minimumFareCents: number,
  currency = 'eur',
): SimulationOutcome {
  try {
    const result = priceHourly({
      durationHours: hours,
      rate: { pricePerHourCents },
      surcharges: [],
      params: { currency, minimumFareCents, timezone: DEFAULT_TZ },
    })
    return { amountCents: result.amountCents, bandName: null, error: null }
  } catch (e) {
    return {
      amountCents: 0,
      bandName: null,
      error: e instanceof PricingError ? e.message : 'Calcul impossible.',
    }
  }
}

// ─── Lien de configuration ───────────────────────────────────────────────────

/** Durée de validité d'un lien de configuration. */
export const SETUP_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours

export type SetupLinkStatus = 'none' | 'expired' | 'ready' | 'started' | 'completed'

/** État lisible du lien / du parcours, pour l'admin. */
export function setupLinkStatus(d: {
  setupToken: string | null
  setupTokenExpiresAt: Date | string | null
  setupStartedAt: Date | string | null
  setupCompletedAt: Date | string | null
}, now = new Date()): SetupLinkStatus {
  if (d.setupCompletedAt) return 'completed'
  if (!d.setupToken) return 'none'
  if (d.setupTokenExpiresAt && new Date(d.setupTokenExpiresAt) < now) return 'expired'
  return d.setupStartedAt ? 'started' : 'ready'
}
