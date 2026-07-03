import type { Quote, RideRequest } from '@prisma/client'

/**
 * Un devis en attente de paiement du client (SENT) est « expiré » — et donc à
 * archiver — dès que sa fenêtre de paiement est close, c'est-à-dire :
 *  - son délai de validité (`expiresAt`) est dépassé, OU
 *  - la date/heure de la course est déjà passée (inutile de régler une course
 *    qui aurait déjà dû avoir lieu).
 *
 * Ne concerne que les devis SENT : un DRAFT (en attente de validation chauffeur)
 * ou un devis déjà ACCEPTED/annulé n'entre pas dans cette logique.
 */
export function isQuotePaymentExpired(
  quote: Pick<Quote, 'status' | 'expiresAt'> & { rideRequest: Pick<RideRequest, 'scheduledAt'> },
  now: Date = new Date(),
): boolean {
  if (quote.status !== 'SENT') return false
  return (
    quote.expiresAt.getTime() < now.getTime() ||
    quote.rideRequest.scheduledAt.getTime() < now.getTime()
  )
}
