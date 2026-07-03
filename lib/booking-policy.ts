// Politique de réservation & paiement d'un chauffeur — logique partagée serveur/client.
// Deux axes de réglage indépendants :
//  - paiement : dérivé de `paymentMethods` (en ligne exigé / au choix du client / sur place)
//  - confirmation : `autoAcceptQuotes` (automatique si créneau libre / validation manuelle)
// Le croisement produit les quatre flux de réservation (+ variantes « au choix »).

import { ONSITE_METHODS, type PaymentMethod } from './payment-methods'

/** Place du paiement en ligne dans les réglages du chauffeur. */
export type OnlinePaymentPolicy =
  | 'REQUIRED' // exigé : le client paie en ligne pour réserver
  | 'OPTIONAL' // proposé : le client choisit entre en ligne et sur place
  | 'NONE' // désactivé : tout se règle sur place

export interface BookingPolicyDriver {
  paymentMethods: PaymentMethod[]
  autoAcceptQuotes: boolean
}

/** Politique de paiement en ligne CONFIGURÉE (indépendante de l'état du compte). */
export function onlinePaymentPolicy(methods: PaymentMethod[]): OnlinePaymentPolicy {
  const online = methods.includes('STRIPE_PREPAYMENT')
  const onSite = methods.some((m) => ONSITE_METHODS.includes(m))
  if (online && onSite) return 'OPTIONAL'
  if (online) return 'REQUIRED'
  return 'NONE'
}

/** Moyens d'encaissement sur place acceptés, dans l'ordre d'affichage. */
export function onSitePaymentMethods(methods: PaymentMethod[]): PaymentMethod[] {
  return ONSITE_METHODS.filter((m) => methods.includes(m))
}

/** Mode de réservation effectif d'un chauffeur, compte tenu de l'état de son compte de paiement. */
export interface BookingMode {
  /** Politique de paiement en ligne configurée. */
  policy: OnlinePaymentPolicy
  /** Paiement en ligne réellement proposable (configuré ET prestataire opérationnel). */
  onlineAvailable: boolean
  /** Moyens d'encaissement sur place proposés au client. */
  onSiteMethods: PaymentMethod[]
  /** Confirmation automatique souhaitée par le chauffeur. */
  autoConfirm: boolean
  /** Flux 1 : la course est confirmée par le paiement en ligne, sans validation. */
  instantOnline: boolean
  /** Flux 3 : la course est confirmée immédiatement, règlement sur place. */
  instantOnSite: boolean
}

export function bookingMode(driver: BookingPolicyDriver, onlineReady: boolean): BookingMode {
  const policy = onlinePaymentPolicy(driver.paymentMethods)
  const onlineAvailable = policy !== 'NONE' && onlineReady
  const onSiteMethods = onSitePaymentMethods(driver.paymentMethods)
  const autoConfirm = driver.autoAcceptQuotes
  return {
    policy,
    onlineAvailable,
    onSiteMethods,
    autoConfirm,
    instantOnline: autoConfirm && onlineAvailable,
    instantOnSite: autoConfirm && onSiteMethods.length > 0,
  }
}

/**
 * Règlement effectif d'une demande donnée.
 *  - ONLINE : prépaiement carte (la confirmation passe par le paiement)
 *  - ONSITE : encaissement sur place (la confirmation peut être immédiate)
 *  - UNDECIDED : aucun moyen opérationnel — la demande part en validation
 *    manuelle et le règlement se décide en aval (page devis / contact direct).
 */
export type ResolvedPayment =
  | { kind: 'ONLINE' }
  | { kind: 'ONSITE'; method: PaymentMethod }
  | { kind: 'UNDECIDED' }

/**
 * Résout le règlement d'une demande : le choix explicite du client s'il est
 * toujours proposé par le chauffeur, sinon le comportement par défaut du mode
 * (en ligne dès que possible, sinon premier moyen sur place accepté).
 */
export function resolveRequestPayment(
  mode: Pick<BookingMode, 'onlineAvailable' | 'onSiteMethods'>,
  preferred: PaymentMethod | null | undefined,
): ResolvedPayment {
  if (preferred === 'STRIPE_PREPAYMENT' && mode.onlineAvailable) return { kind: 'ONLINE' }
  if (preferred && preferred !== 'STRIPE_PREPAYMENT' && mode.onSiteMethods.includes(preferred)) {
    return { kind: 'ONSITE', method: preferred }
  }
  // Pas de choix (ancien formulaire) ou choix devenu invalide : défaut du mode.
  if (mode.onlineAvailable) return { kind: 'ONLINE' }
  if (mode.onSiteMethods.length > 0) return { kind: 'ONSITE', method: mode.onSiteMethods[0]! }
  return { kind: 'UNDECIDED' }
}
