import type { Driver, HourlyRateTier, Surcharge, TransferRateBand } from '@prisma/client'
import {
  priceHourly,
  priceTransfer,
  type PriceResult,
  type SurchargeInput,
} from '~/lib/pricing'
import { computeRoute, type LatLng } from './google-maps'

export interface DriverWithPricing extends Driver {
  transferBands: TransferRateBand[]
  hourlyTiers: HourlyRateTier[]
  surcharges: Surcharge[]
}

export interface QuoteComputation {
  price: PriceResult
  distanceMeters?: number
  durationSeconds?: number
  estimatedRoute?: boolean
}

function mapSurcharges(surcharges: Surcharge[]): SurchargeInput[] {
  return surcharges
    .filter((s) => s.autoApply)
    .map((s) => ({ name: s.name, kind: s.kind, amount: s.amount }))
}

/** Vérifie le délai minimum de réservation. Lève une Error si trop proche. */
export function assertLeadTime(driver: Driver, scheduledAt: Date, now = new Date()): void {
  const minMs = driver.minLeadTimeMinutes * 60_000
  if (scheduledAt.getTime() - now.getTime() < minMs) {
    const err = new Error(
      `Réservation possible au plus tôt ${driver.minLeadTimeMinutes / 60}h à l'avance.`,
    )
    err.name = 'LeadTimeError'
    throw err
  }
}

export interface ComputeArgs {
  driver: DriverWithPricing
  type: 'TRANSFER' | 'HOURLY'
  scheduledAt: Date
  pickup?: LatLng
  dropoff?: LatLng
  roundTrip?: boolean
  durationHours?: number
  apiKey?: string
}

/** Calcule un devis à partir d'une demande et de la configuration du chauffeur. */
export async function computeQuote(args: ComputeArgs): Promise<QuoteComputation> {
  const { driver, type, scheduledAt } = args
  const params = {
    currency: driver.currency,
    minimumFareCents: driver.minimumFareCents,
    timezone: driver.timezone,
  }
  const surcharges = mapSurcharges(driver.surcharges)

  if (type === 'TRANSFER') {
    if (!args.pickup || !args.dropoff) {
      throw new Error('Adresses requises pour un transfert.')
    }
    const route = await computeRoute(args.pickup, args.dropoff, args.apiKey)
    const price = priceTransfer({
      distanceMeters: route.distanceMeters,
      scheduledAt,
      roundTrip: args.roundTrip ?? false,
      bands: driver.transferBands.map((b) => ({
        name: b.name,
        pricePerKmCents: b.pricePerKmCents,
        daysOfWeek: b.daysOfWeek,
        startMinute: b.startMinute,
        endMinute: b.endMinute,
        priority: b.priority,
        isDefault: b.isDefault,
      })),
      surcharges,
      params,
    })
    return {
      price,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      estimatedRoute: route.estimated,
    }
  }

  // HOURLY
  if (!args.durationHours) throw new Error('Durée requise pour une mise à disposition.')
  const price = priceHourly({
    durationHours: args.durationHours,
    tiers: driver.hourlyTiers.map((t) => ({
      minHours: t.minHours,
      pricePerHourCents: t.pricePerHourCents,
    })),
    surcharges,
    params,
  })
  return { price }
}
