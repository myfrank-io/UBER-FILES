import { formatMoney, metersToKm, roundCents } from '../money'
import {
  airportPackageCents,
  airportRideLabel,
  type AirportRates,
  type AirportSelection,
} from '../airport'
import { applySurcharges, PricingError } from './transfer'
import type { BreakdownLine, DriverPricingParams, PriceResult, SurchargeInput } from './types'

export interface AirportPricingInput {
  selection: AirportSelection
  rates: AirportRates
  /** Distance du trajet — requise uniquement hors Paris (le forfait n'en dépend pas). */
  distanceMeters?: number | null
  surcharges: SurchargeInput[]
  params: DriverPricingParams
}

function formatKm(km: number): string {
  return km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

/**
 * Calcule le prix d'un transfert aéroport.
 * — Rive droite / rive gauche : le forfait du chauffeur, appliqué TEL QUEL (c'est
 *   un prix fixe choisi par lui : le minimum de course ne le remonte pas).
 * — Hors Paris : distance réelle × prix au km aéroport, avec le minimum de course
 *   comme pour un transfert classique.
 * Les majorations automatiques (dernière minute…) s'ajoutent ensuite au sous-total,
 * comme pour toutes les courses.
 */
export function priceAirport(input: AirportPricingInput): PriceResult {
  const { selection, rates, surcharges, params } = input
  const breakdown: BreakdownLine[] = []
  const title = `Transfert aéroport — ${airportRideLabel(selection)}`
  let subtotal: number

  if (selection.zone === 'HORS_PARIS') {
    if (rates.kmRateCents == null) {
      throw new PricingError(
        'Le chauffeur ne propose pas de transfert aéroport hors Paris.',
        'AIRPORT_KM_RATE_NOT_SET',
      )
    }
    if (!input.distanceMeters || input.distanceMeters <= 0) {
      throw new PricingError('Distance invalide pour un transfert aéroport.', 'INVALID_DISTANCE')
    }
    const km = metersToKm(input.distanceMeters)
    subtotal = roundCents(km * rates.kmRateCents)
    breakdown.push({
      label: title,
      amountCents: subtotal,
      detail: `${formatKm(km)} km × ${formatMoney(rates.kmRateCents, params.currency)}/km`,
    })
    if (subtotal < params.minimumFareCents) {
      const adjustment = params.minimumFareCents - subtotal
      breakdown.push({
        label: 'Ajustement au minimum de course',
        amountCents: adjustment,
        detail: `minimum ${formatMoney(params.minimumFareCents, params.currency)}`,
      })
      subtotal = params.minimumFareCents
    }
  } else {
    const packageCents = airportPackageCents(rates, selection.hub, selection.zone)
    if (packageCents == null) {
      throw new PricingError(
        "Ce forfait aéroport n'est pas proposé par le chauffeur.",
        'AIRPORT_PACKAGE_NOT_SET',
      )
    }
    subtotal = packageCents
    breakdown.push({ label: title, amountCents: packageCents, detail: 'forfait, prix fixe' })
  }

  const { lines, addedCents } = applySurcharges(subtotal, surcharges)
  breakdown.push(...lines)

  return {
    amountCents: subtotal + addedCents,
    currency: params.currency,
    breakdown,
  }
}
