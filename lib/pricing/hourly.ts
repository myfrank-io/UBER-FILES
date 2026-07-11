import { formatMoney, roundCents } from '../money'
import { applySurcharges, PricingError } from './transfer'
import type { BreakdownLine, HourlyPricingInput, PriceResult } from './types'

/**
 * Calcule le prix d'une mise à disposition.
 * Tarif horaire de base jusqu'au seuil, puis tarif heure supplémentaire au-delà
 * (ex: les 8 premières heures à 50 €/h, ensuite 40 €/h). Chaque heure est
 * facturée au tarif de sa tranche — jamais toute la durée au tarif réduit.
 * Applique le prix minimum de course puis les majorations.
 */
export function priceHourly(input: HourlyPricingInput): PriceResult {
  const { durationHours, rate, surcharges, params } = input

  if (durationHours <= 0 || !Number.isFinite(durationHours)) {
    throw new PricingError('Durée invalide pour une mise à disposition.', 'INVALID_DURATION')
  }
  if (!rate || !(rate.pricePerHourCents > 0)) {
    throw new PricingError('Aucun tarif horaire défini.', 'NO_HOURLY_RATE')
  }

  const overtime =
    rate.overtimeAfterHours != null &&
    rate.overtimeAfterHours > 0 &&
    rate.overtimePricePerHourCents != null &&
    rate.overtimePricePerHourCents > 0 &&
    durationHours > rate.overtimeAfterHours
      ? { afterHours: rate.overtimeAfterHours, pricePerHourCents: rate.overtimePricePerHourCents }
      : null

  const breakdown: BreakdownLine[] = []
  let subtotal: number

  if (overtime) {
    const baseCents = roundCents(rate.pricePerHourCents * overtime.afterHours)
    const extraHours = durationHours - overtime.afterHours
    const extraCents = roundCents(overtime.pricePerHourCents * extraHours)
    subtotal = baseCents + extraCents
    breakdown.push(
      {
        label: 'Mise à disposition',
        amountCents: baseCents,
        detail: `${overtime.afterHours} h × ${formatMoney(rate.pricePerHourCents, params.currency)}/h`,
      },
      {
        label: 'Heures supplémentaires',
        amountCents: extraCents,
        detail: `${extraHours} h × ${formatMoney(overtime.pricePerHourCents, params.currency)}/h`,
      },
    )
  } else {
    subtotal = roundCents(rate.pricePerHourCents * durationHours)
    breakdown.push({
      label: 'Mise à disposition',
      amountCents: subtotal,
      detail: `${durationHours} h × ${formatMoney(rate.pricePerHourCents, params.currency)}/h`,
    })
  }

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
