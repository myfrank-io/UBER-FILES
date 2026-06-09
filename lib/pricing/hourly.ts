import { formatMoney, roundCents } from '../money'
import { applySurcharges, PricingError } from './transfer'
import type { BreakdownLine, HourlyPricingInput, HourlyRateTierInput, PriceResult } from './types'

/**
 * Sélectionne le palier horaire applicable : celui dont `minHours` est le plus grand
 * tout en restant ≤ à la durée demandée. (Grille dégressive : plus c'est long, moins c'est cher.)
 */
export function selectHourlyTier(
  tiers: HourlyRateTierInput[],
  durationHours: number,
): HourlyRateTierInput | null {
  const eligible = tiers
    .filter((t) => t.minHours <= durationHours)
    .sort((a, b) => b.minHours - a.minHours)
  return eligible[0] ?? null
}

/**
 * Calcule le prix d'une mise à disposition.
 * Tarif horaire dégressif par paliers (ex: 1h = 60 €, 4h = 55 €/h…).
 * Applique le prix minimum de course puis les majorations.
 */
export function priceHourly(input: HourlyPricingInput): PriceResult {
  const { durationHours, tiers, surcharges, params } = input

  if (durationHours <= 0 || !Number.isFinite(durationHours)) {
    throw new PricingError('Durée invalide pour une mise à disposition.', 'INVALID_DURATION')
  }
  if (tiers.length === 0) {
    throw new PricingError('Aucune grille horaire définie.', 'NO_TIERS')
  }

  const tier = selectHourlyTier(tiers, durationHours)
  if (!tier) {
    throw new PricingError(
      `Durée inférieure au plus petit palier (${Math.min(...tiers.map((t) => t.minHours))}h).`,
      'BELOW_MIN_TIER',
    )
  }

  const baseCents = roundCents(tier.pricePerHourCents * durationHours)
  const breakdown: BreakdownLine[] = [
    {
      label: 'Mise à disposition',
      amountCents: baseCents,
      detail: `${durationHours} h × ${formatMoney(tier.pricePerHourCents, params.currency)}/h`,
    },
  ]

  let subtotal = baseCents
  if (subtotal < params.minimumFareCents) {
    const adjustment = params.minimumFareCents - subtotal
    breakdown.push({
      label: 'Ajustement au minimum de course',
      amountCents: adjustment,
      detail: `minimum ${formatMoney(params.minimumFareCents, params.currency)}`,
    })
    subtotal = params.minimumFareCents
  }

  const { lines, addedCents } = applySurcharges(subtotal, surcharges)
  breakdown.push(...lines)

  return {
    amountCents: subtotal + addedCents,
    currency: params.currency,
    breakdown,
  }
}
