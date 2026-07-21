import { applyBps, formatMoney, metersToKm, roundCents } from '../money'
import { selectBand } from './timeband'
import type {
  BreakdownLine,
  PriceResult,
  SurchargeInput,
  TransferPricingInput,
  TransferRateTierInput,
} from './types'

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

function formatKm(km: number): string {
  return km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

interface TierSegment {
  fromKm: number
  /** null = tranche illimitée (la dernière). */
  uptoKm: number | null
  km: number
  pricePerKmCents: number
}

/**
 * Découpe la distance facturée selon les paliers dégressifs de la bande.
 * Barème PROGRESSIF : chaque kilomètre est facturé au tarif de sa tranche
 * (jamais toute la course au tarif de la tranche atteinte), le prix ne peut
 * donc pas baisser quand la distance augmente. Défensif vis-à-vis des données :
 * tranches retriées par borne croissante, et la dernière est toujours traitée
 * comme illimitée même si sa borne est renseignée.
 */
export function tierSegments(billedKm: number, tiers: TransferRateTierInput[]): TierSegment[] {
  const sorted = [...tiers].sort((a, b) => (a.uptoKm ?? Infinity) - (b.uptoKm ?? Infinity))
  const segments: TierSegment[] = []
  let fromKm = 0
  for (const [i, tier] of sorted.entries()) {
    const uptoKm = i === sorted.length - 1 ? null : tier.uptoKm
    const km = (uptoKm == null ? billedKm : Math.min(billedKm, uptoKm)) - fromKm
    if (km > 0) {
      segments.push({ fromKm, uptoKm, km, pricePerKmCents: tier.pricePerKmCents })
    }
    if (uptoKm == null || uptoKm >= billedKm) break
    fromKm = uptoKm
  }
  return segments
}

/**
 * Calcule le prix d'un transfert A → B.
 * Prix = €/km × distance, au taux de la bande horaire applicable au départ.
 * Si la bande a des paliers dégressifs, chaque kilomètre est facturé au tarif
 * de sa tranche (une ligne de détail par tranche entamée).
 * Option aller-retour : double la distance facturée — la grille s'applique à la
 * distance totale, le retour bénéficie donc des tranches dégressives.
 * Applique le prix minimum de course, puis les majorations sur le sous-total.
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
  const title = `Transfert${roundTrip ? ' (aller-retour)' : ''} — ${band.name}`

  const breakdown: BreakdownLine[] = []
  let baseCents = 0
  if (band.tiers && band.tiers.length > 0) {
    for (const [i, seg] of tierSegments(billedKm, band.tiers).entries()) {
      const amount = roundCents(seg.km * seg.pricePerKmCents)
      baseCents += amount
      breakdown.push({
        label:
          i === 0
            ? title
            : seg.uptoKm == null
              ? `Au-delà de ${formatKm(seg.fromKm)} km`
              : `De ${formatKm(seg.fromKm)} à ${formatKm(seg.uptoKm)} km`,
        amountCents: amount,
        detail: `${formatKm(seg.km)} km × ${formatMoney(seg.pricePerKmCents, params.currency)}/km`,
      })
    }
  } else {
    baseCents = roundCents(billedKm * band.pricePerKmCents)
    breakdown.push({
      label: title,
      amountCents: baseCents,
      detail: `${formatKm(billedKm)} km × ${formatMoney(band.pricePerKmCents, params.currency)}/km`,
    })
  }

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

  const { lines, addedCents } = applySurcharges(subtotal, surcharges)
  breakdown.push(...lines)

  return {
    amountCents: subtotal + addedCents,
    currency: params.currency,
    breakdown,
  }
}
