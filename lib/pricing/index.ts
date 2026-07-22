// Point d'entrée du moteur de tarification.
import { applyBps } from '../money'
export * from './types'
export { priceTransfer, applySurcharges, PricingError, tierSegments } from './transfer'
export { priceHourly } from './hourly'
export { priceAirport } from './airport'
export { selectBand, localMoment, minuteInRange } from './timeband'

/**
 * Calcule la commission plateforme (application_fee Stripe) sur un montant.
 * Paramétrée en points de base ; 0 au lancement (cf. décision produit).
 */
export function computeApplicationFee(amountCents: number, commissionBps: number): number {
  if (commissionBps <= 0) return 0
  return applyBps(amountCents, commissionBps)
}
