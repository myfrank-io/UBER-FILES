import { formatMoney, roundCents } from '../money'
import { applySurcharges, PricingError } from './transfer'
import type { BreakdownLine, HourlyPricingInput, PriceResult } from './types'

/**
 * Calcule le prix d'une mise à disposition.
 * Tarif horaire de base jusqu'au seuil, puis tarif heure supplémentaire au-delà
 * (ex: les 8 premières heures à 50 €/h, ensuite 40 €/h), avec en option une
 * seconde tranche au-delà d'un second seuil (ex: puis 30 €/h après 12 h).
 * Chaque heure est facturée au tarif de sa tranche — jamais toute la durée au
 * tarif réduit. Applique le prix minimum de course puis les majorations.
 *
 * Une durée inférieure au minimum du chauffeur (`rate.minHours`) est REFUSÉE
 * plutôt que facturée au minimum : le client doit savoir ce qu'il commande.
 */
export function priceHourly(input: HourlyPricingInput): PriceResult {
  const { durationHours, rate, surcharges, params } = input

  if (durationHours <= 0 || !Number.isFinite(durationHours)) {
    throw new PricingError('Durée invalide pour une mise à disposition.', 'INVALID_DURATION')
  }
  if (!rate || !(rate.pricePerHourCents > 0)) {
    throw new PricingError('Aucun tarif horaire défini.', 'NO_HOURLY_RATE')
  }
  // Durée minimale du chauffeur : garde-fou métier partagé par l'estimation en
  // direct et la soumission de la demande (le formulaire public borne déjà le
  // sélecteur, mais l'API ne s'y fie pas).
  const minHours = rate.minHours != null && rate.minHours > 1 ? rate.minHours : null
  if (minHours != null && durationHours < minHours) {
    throw new PricingError(
      `Ce chauffeur accepte les mises à disposition à partir de ${minHours} h.`,
      'BELOW_MIN_DURATION',
    )
  }

  const overtime =
    rate.overtimeAfterHours != null &&
    rate.overtimeAfterHours > 0 &&
    rate.overtimePricePerHourCents != null &&
    rate.overtimePricePerHourCents > 0
      ? { afterHours: rate.overtimeAfterHours, pricePerHourCents: rate.overtimePricePerHourCents }
      : null

  // La seconde tranche n'a de sens qu'en prolongement de la première, avec un
  // seuil strictement supérieur ; toute configuration incohérente est ignorée.
  const overtime2 =
    overtime != null &&
    rate.overtime2AfterHours != null &&
    rate.overtime2AfterHours > overtime.afterHours &&
    rate.overtime2PricePerHourCents != null &&
    rate.overtime2PricePerHourCents > 0
      ? { afterHours: rate.overtime2AfterHours, pricePerHourCents: rate.overtime2PricePerHourCents }
      : null

  // Tranches effectivement entamées par la durée, dans l'ordre. Chacune court
  // de son seuil au seuil de la suivante (ou à la fin de la mise à disposition).
  const tiers = [
    { fromHours: 0, pricePerHourCents: rate.pricePerHourCents, label: 'Mise à disposition' },
  ]
  if (overtime && durationHours > overtime.afterHours) {
    const reachesTier2 = overtime2 != null && durationHours > overtime2.afterHours
    tiers.push({
      fromHours: overtime.afterHours,
      pricePerHourCents: overtime.pricePerHourCents,
      label: reachesTier2
        ? `Heures supplémentaires (jusqu'à ${overtime2!.afterHours} h)`
        : 'Heures supplémentaires',
    })
    if (reachesTier2) {
      tiers.push({
        fromHours: overtime2!.afterHours,
        pricePerHourCents: overtime2!.pricePerHourCents,
        label: `Heures supplémentaires (au-delà de ${overtime2!.afterHours} h)`,
      })
    }
  }

  const breakdown: BreakdownLine[] = []
  let subtotal = 0

  tiers.forEach((tier, i) => {
    const upToHours = tiers[i + 1]?.fromHours ?? durationHours
    const hours = upToHours - tier.fromHours
    const amountCents = roundCents(tier.pricePerHourCents * hours)
    subtotal += amountCents
    breakdown.push({
      label: tier.label,
      amountCents,
      detail: `${hours} h × ${formatMoney(tier.pricePerHourCents, params.currency)}/h`,
    })
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

  const { lines, addedCents } = applySurcharges(subtotal, surcharges)
  breakdown.push(...lines)

  return {
    amountCents: subtotal + addedCents,
    currency: params.currency,
    breakdown,
  }
}
