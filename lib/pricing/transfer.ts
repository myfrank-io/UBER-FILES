import { applyBps, formatMoney, metersToKm, roundCents } from '../money'
import { selectBand } from './timeband'
import type { BreakdownLine, PriceResult, SurchargeInput, TransferPricingInput } from './types'

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'PricingError'
  }
}

/** Applique les majorations à un sous-total et renvoie les lignes de détail + le total ajouté. */
export function applySurcharges(
  subtotalCents: number,
  surcharges: SurchargeInput[],
  currency: string,
): { lines: BreakdownLine[]; addedCents: number } {
  const lines: BreakdownLine[] = []
  let addedCents = 0
  for (const s of surcharges) {
    const amount = s.kind === 'FIXED' ? s.amount : applyBps(subtotalCents, s.amount)
    addedCents += amount
    lines.push({
      label: s.name,
      amountCents: amount,
      detail:
        s.kind === 'PERCENT' ? `${(s.amount / 100).toLocaleString('fr-FR')} %` : undefined,
    })
  }
  return { lines, addedCents }
}

/**
 * Calcule le prix d'un transfert A → B.
 * Prix = €/km × distance, au taux de la bande horaire applicable au départ.
 * Option aller-retour : double la distance facturée. Applique le prix minimum de course,
 * puis les majorations sur le sous-total.
 */
export function priceTransfer(input: TransferPricingInput): PriceResult {
  const { distanceMeters, scheduledAt, roundTrip, bands, surcharges, params } = input

  if (distanceMeters <= 0) {
    throw new PricingError('Distance invalide pour un transfert.', 'INVALID_DISTANCE')
  }
  if (bands.length === 0) {
    throw new PricingError('Aucune grille tarifaire de transfert définie.', 'NO_BANDS')
  }

  const band = selectBand(bands, scheduledAt, params.timezone)
  if (!band) {
    throw new PricingError(
      "Aucune bande tarifaire ne couvre l'horaire demandé.",
      'NO_MATCHING_BAND',
    )
  }

  const km = metersToKm(distanceMeters)
  const billedKm = roundTrip ? km * 2 : km
  const baseCents = roundCents(billedKm * band.pricePerKmCents)

  const breakdown: BreakdownLine[] = []
  breakdown.push({
    label: `Transfert${roundTrip ? ' (aller-retour)' : ''} — ${band.name}`,
    amountCents: baseCents,
    detail: `${billedKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km × ${formatMoney(
      band.pricePerKmCents,
      params.currency,
    )}/km`,
  })

  // Application du prix minimum de course.
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

  const { lines, addedCents } = applySurcharges(subtotal, surcharges, params.currency)
  breakdown.push(...lines)

  return {
    amountCents: subtotal + addedCents,
    currency: params.currency,
    breakdown,
  }
}
