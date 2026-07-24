import type { Driver, Surcharge, TransferRateBand, TransferRateTier } from '@prisma/client'
import {
  passengerSurcharges,
  priceAirport,
  priceHourly,
  priceTransfer,
  type PriceResult,
  type SurchargeInput,
} from '~/lib/pricing'
import { airportRatesFromDriver, type AirportSelection } from '~/lib/airport'
import { computeRoute, type LatLng } from './google-maps'

// `photoUrl` est omis globalement par le client Prisma (blob base64 jamais
// rapatrié) : le type reflète la forme réellement retournée par les requêtes.
export interface DriverWithPricing extends Omit<Driver, 'photoUrl'> {
  transferBands: (TransferRateBand & { tiers: TransferRateTier[] })[]
  surcharges: Surcharge[]
}

export interface QuoteComputation {
  price: PriceResult
  distanceMeters?: number
  durationSeconds?: number
  estimatedRoute?: boolean
}

/**
 * Majorations automatiques applicables à une demande. Celles portant une fenêtre
 * « dernière minute » (maxLeadTimeMinutes) ne s'appliquent que si la course est
 * réservée moins de X minutes avant la prise en charge. Le délai est évalué au
 * moment de la demande — sens de « commande passée moins de 2 h à l'avance » —
 * et n'est pas recalculé à la validation ni au paiement.
 */
export function applicableSurcharges(
  surcharges: Surcharge[],
  leadTimeMinutes: number,
): SurchargeInput[] {
  return surcharges
    .filter((s) => s.autoApply)
    .filter((s) => s.maxLeadTimeMinutes == null || leadTimeMinutes < s.maxLeadTimeMinutes)
    .map((s) => ({ name: s.name, kind: s.kind, amount: s.amount }))
}

/** Vérifie le délai minimum de réservation. Lève une Error si trop proche. */
export function assertLeadTime(
  driver: Pick<Driver, 'minLeadTimeMinutes'>,
  scheduledAt: Date,
  now = new Date(),
): void {
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
  // Nombre de personnes dans le véhicule (déclenche le supplément 3e/4e personne
  // du chauffeur). Absent ou < 3 = aucun supplément passager.
  passengers?: number
  // Transfert aéroport (onglet dédié) : tarification au forfait de la zone (ou au
  // km hors Paris) à la place de la grille kilométrique classique.
  airport?: AirportSelection
  apiKey?: string
  // Instant de la demande (injectable pour les tests) — sert au calcul du délai
  // de réservation pour les majorations « dernière minute ».
  now?: Date
}

/** Calcule un devis à partir d'une demande et de la configuration du chauffeur. */
export async function computeQuote(args: ComputeArgs): Promise<QuoteComputation> {
  const { driver, type, scheduledAt } = args
  const params = {
    currency: driver.currency,
    minimumFareCents: driver.minimumFareCents,
    timezone: driver.timezone,
  }
  const now = args.now ?? new Date()
  const leadTimeMinutes = (scheduledAt.getTime() - now.getTime()) / 60_000
  // Majorations automatiques (dernière minute…) puis, en plus, le supplément lié
  // au nombre de personnes dans le véhicule. Toutes s'appliquent de la même façon
  // sur le sous-total, quel que soit le type de course.
  const surcharges: SurchargeInput[] = [
    ...applicableSurcharges(driver.surcharges, leadTimeMinutes),
    ...passengerSurcharges(args.passengers ?? 1, {
      thirdPassengerCents: driver.passengerSurcharge3Cents,
      fourthPassengerCents: driver.passengerSurcharge4Cents,
    }),
  ]

  if (type === 'TRANSFER') {
    if (!args.pickup || !args.dropoff) {
      throw new Error('Adresses requises pour un transfert.')
    }
    const route = await computeRoute(args.pickup, args.dropoff, args.apiKey)

    // Transfert aéroport : forfait de la zone (ou km hors Paris). Le trajet est
    // tout de même calculé — la durée sert au créneau calendrier, la distance au
    // prix hors Paris.
    if (args.airport) {
      const price = priceAirport({
        selection: args.airport,
        rates: airportRatesFromDriver(driver),
        distanceMeters: route.distanceMeters,
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

    const price = priceTransfer({
      distanceMeters: route.distanceMeters,
      scheduledAt,
      roundTrip: args.roundTrip ?? false,
      bands: driver.transferBands.map((b) => ({
        name: b.name,
        pricePerKmCents: b.pricePerKmCents,
        tiers: (b.tiers ?? []).map((t) => ({ uptoKm: t.uptoKm, pricePerKmCents: t.pricePerKmCents })),
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
    rate: {
      pricePerHourCents: driver.hourlyRateCents ?? 0,
      overtimeAfterHours: driver.hourlyOvertimeAfterHours,
      overtimePricePerHourCents: driver.hourlyOvertimeRateCents,
      overtime2AfterHours: driver.hourlyOvertime2AfterHours,
      overtime2PricePerHourCents: driver.hourlyOvertime2RateCents,
    },
    surcharges,
    params,
  })
  return { price }
}
