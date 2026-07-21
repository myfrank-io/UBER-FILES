// Types du moteur de tarification. Volontairement découplés de Prisma pour rester
// testables sans base de données : on passe des objets simples en entrée.

export type ServiceType = 'TRANSFER' | 'HOURLY'

export type SurchargeKind = 'FIXED' | 'PERCENT'

export interface SurchargeInput {
  name: string
  kind: SurchargeKind
  /** Centimes si FIXED, points de base (1 % = 100) si PERCENT. */
  amount: number
}

export interface TransferRateTierInput {
  /** Borne haute de la tranche en km (exclue). null = dernière tranche, illimitée. */
  uptoKm: number | null
  pricePerKmCents: number
}

export interface TransferRateBandInput {
  name: string
  pricePerKmCents: number
  /**
   * Paliers dégressifs optionnels, du premier au dernier. Barème progressif :
   * chaque kilomètre est facturé au tarif de sa tranche. Vide ou absent =
   * prix unique `pricePerKmCents`.
   */
  tiers?: TransferRateTierInput[]
  /** Jours couverts (0 = dimanche … 6 = samedi). Vide = tous les jours. */
  daysOfWeek: number[]
  /** Minute de début dans la journée locale (0..1439). */
  startMinute: number
  /** Minute de fin (exclue). Peut dépasser 1440 pour chevaucher minuit (ex: nuit 22h→6h). */
  endMinute: number
  priority: number
  /** Bande de repli si aucune autre ne correspond. */
  isDefault: boolean
}

export interface HourlyRateInput {
  /** Tarif horaire de base (centimes). */
  pricePerHourCents: number
  /** Seuil (heures) au-delà duquel le tarif heure supplémentaire s'applique. */
  overtimeAfterHours?: number | null
  /** Tarif des heures supplémentaires (centimes). */
  overtimePricePerHourCents?: number | null
}

export interface BreakdownLine {
  label: string
  amountCents: number
  /** Détail facultatif (ex: "12,4 km × 2,10 €/km"). */
  detail?: string
}

export interface PriceResult {
  amountCents: number
  currency: string
  breakdown: BreakdownLine[]
}

export interface DriverPricingParams {
  currency: string
  minimumFareCents: number
  timezone: string
}

export interface TransferPricingInput {
  distanceMeters: number
  scheduledAt: Date
  roundTrip: boolean
  bands: TransferRateBandInput[]
  surcharges: SurchargeInput[]
  params: DriverPricingParams
}

export interface HourlyPricingInput {
  durationHours: number
  rate: HourlyRateInput
  surcharges: SurchargeInput[]
  params: DriverPricingParams
}
