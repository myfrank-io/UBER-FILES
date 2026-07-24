import type { PassengerSurchargeConfig, SurchargeInput } from './types'

// Libellés des lignes de supplément affichées dans le détail du prix (client).
export const PASSENGER_SURCHARGE_LABELS = {
  third: 'Supplément 3e personne',
  fourth: 'Supplément 4e personne',
} as const

/**
 * Suppléments liés au nombre de personnes dans le véhicule, sous forme de
 * majorations fixes prêtes à passer au moteur de tarification (comme n'importe
 * quelle autre majoration).
 *
 * Barème CUMULATIF : le supplément « 3e personne » s'ajoute dès 3 passagers, et
 * celui de la « 4e personne » s'ajoute EN PLUS dès 4 passagers. 1 et 2 personnes
 * n'en portent jamais ; au-delà de 4, aucun supplément additionnel (le barème
 * n'est défini que pour la 3e et la 4e personne). Un montant nul ou absent est
 * ignoré (aucune ligne à 0 € dans le détail).
 *
 * Exemple (3e = 5 €, 4e = 5 €) : 2 pers. → +0 €, 3 pers. → +5 €, 4 pers. → +10 €.
 */
export function passengerSurcharges(
  passengers: number,
  config: PassengerSurchargeConfig,
): SurchargeInput[] {
  const count = Math.floor(passengers)
  if (!Number.isFinite(count) || count < 3) return []

  const lines: SurchargeInput[] = []
  if (count >= 3 && config.thirdPassengerCents && config.thirdPassengerCents > 0) {
    lines.push({
      name: PASSENGER_SURCHARGE_LABELS.third,
      kind: 'FIXED',
      amount: config.thirdPassengerCents,
    })
  }
  if (count >= 4 && config.fourthPassengerCents && config.fourthPassengerCents > 0) {
    lines.push({
      name: PASSENGER_SURCHARGE_LABELS.fourth,
      kind: 'FIXED',
      amount: config.fourthPassengerCents,
    })
  }
  return lines
}
