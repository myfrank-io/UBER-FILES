// Moyens de paiement — logique partagée serveur / client.
// Le chauffeur choisit dans ses réglages lesquels accepter : prépaiement en ligne
// (Stripe) et/ou encaissement sur place le jour de la course (carte, espèces, chèque).

/** Doit rester aligné avec l'enum `PaymentMethod` de prisma/schema.prisma. */
export type PaymentMethod = 'STRIPE_PREPAYMENT' | 'ONSITE_CARD' | 'ONSITE_CASH' | 'ONSITE_CHECK'

/** Tous les moyens de paiement, dans l'ordre d'affichage. */
export const PAYMENT_METHODS: PaymentMethod[] = [
  'STRIPE_PREPAYMENT',
  'ONSITE_CARD',
  'ONSITE_CASH',
  'ONSITE_CHECK',
]

/** Moyens encaissés sur place le jour de la course (hors prépaiement en ligne). */
export const ONSITE_METHODS: PaymentMethod[] = ['ONSITE_CARD', 'ONSITE_CASH', 'ONSITE_CHECK']

/** Libellé court pour l'interface. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  STRIPE_PREPAYMENT: 'Paiement en ligne (carte, à l’avance)',
  ONSITE_CARD: 'Carte sur place',
  ONSITE_CASH: 'Espèces sur place',
  ONSITE_CHECK: 'Chèque sur place',
}

/** True si le moyen est un encaissement sur place (pas de prépaiement Stripe). */
export function isOnSiteMethod(method: PaymentMethod): boolean {
  return ONSITE_METHODS.includes(method)
}

/** Valeur fournie est-elle un moyen de paiement valide ? */
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as string[]).includes(value)
}
