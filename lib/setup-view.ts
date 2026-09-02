// Formes de données du parcours de configuration telles que les reçoit le
// client (réponse de /api/setup/state). Hors composant : `<script setup>`
// n'autorise pas les exports, et chaque écran du parcours en a besoin.
import type { PaymentMethod } from './payment-methods'
import type { SetupSnapshot } from './setup-flow'

export interface SetupTransferBand {
  id: string
  name: string
  pricePerKmCents: number
  daysOfWeek: number[]
  startMinute: number
  endMinute: number
  priority: number
  isDefault: boolean
  tiers: { uptoKm: number | null; pricePerKmCents: number }[]
}

export interface SetupDriverView {
  id: string
  slug: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  displayName: string
  tagline: string | null
  photoUrl: string | null
  phone: string | null
  contactEmail: string | null
  accountEmail: string | null
  currency: string
  timezone: string
  minimumFareCents: number
  transferBands: SetupTransferBand[]
  hourlyRateCents: number | null
  hourlyOvertimeAfterHours: number | null
  hourlyOvertimeRateCents: number | null
  airportOrlyRiveDroiteCents: number | null
  airportOrlyRiveGaucheCents: number | null
  airportCdgRiveDroiteCents: number | null
  airportCdgRiveGaucheCents: number | null
  airportKmRateCents: number | null
  passengerSurcharge3Cents: number | null
  passengerSurcharge4Cents: number | null
  cancellationPolicy: { freeUntilHours: number; retainedPercent: number } | null
  paymentMethods: PaymentMethod[]
  autoAcceptQuotes: boolean
  paymentProvider: 'STRIPE' | 'SUMUP'
  sumup: { connected: boolean; viaApiKey: boolean }
  stripe: { connected: boolean; chargesEnabled: boolean }
  googlePlace: { placeId: string; name: string | null; address: string | null } | null
  reviewUrl: string | null
  telegramLinked: boolean
  card: { exists: boolean; published: boolean }
}

/** Réponse de /api/setup/state. */
export interface SetupStateView {
  snapshot: SetupSnapshot
  completedAt: string | null
  driver: SetupDriverView
}

/** Véhicule tel que renvoyé par /api/dashboard/vehicles. */
export interface SetupVehicle {
  id: string
  make: string
  modelFamily: string
  modelLabel: string
  vehicleClass: string | null
  seats: number | null
  color: string | null
  isPrimary: boolean
  photoSrc: string | null
}

/** Message d'erreur lisible d'une réponse API. */
export function setupApiError(e: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || fallback
}

/** Euros saisis (« 2,50 ») → centimes entiers, ou null si vide / invalide. */
export function eurosToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const str = String(value).replace(',', '.').trim()
  if (!str) return null
  const n = Number(str)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/** Centimes → chaîne d'euros pour un champ de saisie (« 2.50 »), vide si null. */
export function centsToEuros(cents: number | null | undefined): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}
