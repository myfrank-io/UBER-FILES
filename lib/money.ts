// Utilitaires monétaires. Règle d'or du projet : tout montant est un ENTIER de centimes.
// Aucune opération financière n'utilise de nombre flottant pour stocker un montant.

/** Arrondit un montant flottant (issu d'un calcul) au centime entier le plus proche. */
export function roundCents(value: number): number {
  return Math.round(value)
}

/** Applique un pourcentage exprimé en points de base (1 % = 100 bps) à un montant en centimes. */
export function applyBps(amountCents: number, bps: number): number {
  return roundCents((amountCents * bps) / 10_000)
}

/** Formate un montant en centimes vers une chaîne lisible (ex: 6000 -> "60,00 €"). */
export function formatMoney(amountCents: number, currency = 'eur', locale = 'fr-FR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

/** Convertit des mètres en kilomètres (nombre flottant, usage calcul uniquement). */
export function metersToKm(meters: number): number {
  return meters / 1000
}
