import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { driverBookingMode } from '~/server/utils/driver'

// Consultation d'un devis par le client via son jeton signé (sans compte).
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'quote') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: payload.ref },
    include: { driver: true, rideRequest: true, booking: { include: { payments: true } } },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })

  const expired = quote.status === 'SENT' && quote.expiresAt.getTime() < Date.now()

  // Options de paiement proposées au client selon les réglages du chauffeur :
  // prépaiement en ligne si opérationnel, encaissement sur place si accepté
  // (vide quand le paiement en ligne est exigé).
  const mode = driverBookingMode(quote.driver)

  // Une course annulée ne doit plus apparaître « confirmée » quand le client
  // rouvre son lien devis.
  const bookingCancelled = quote.booking?.status === 'CANCELLED'

  return {
    id: quote.id,
    status: expired ? 'EXPIRED' : quote.status,
    amountCents: quote.amountCents,
    currency: quote.currency,
    breakdown: quote.breakdown,
    expiresAt: quote.expiresAt,
    confirmed:
      !bookingCancelled && (quote.status === 'ACCEPTED' || Boolean(quote.booking)),
    cancelled: bookingCancelled || quote.status === 'CANCELLED',
    // True si la course est déjà confirmée ET réglée en ligne (sinon : règlement sur place).
    alreadyPaid: Boolean(quote.booking?.payments.some((p) => p.status === 'PAID')),
    // True si le chauffeur a ajusté le tarif par rapport à l'estimation initiale.
    adjusted: quote.amountCents !== quote.computedAmountCents,
    payment: {
      // Le prépaiement en ligne n'est proposé que si le chauffeur l'accepte ET que
      // son prestataire de paiement (Stripe ou SumUp) est opérationnel.
      prepaymentAvailable: mode.onlineAvailable,
      // Encaissement sur place : le client réserve et règle le jour de la course.
      onSiteMethods: mode.onSiteMethods,
    },
    driver: { displayName: quote.driver.displayName, slug: quote.driver.slug },
    ride: {
      type: quote.rideRequest.type,
      scheduledAt: quote.rideRequest.scheduledAt,
      pickupAddress: quote.rideRequest.pickupAddress,
      dropoffAddress: quote.rideRequest.dropoffAddress,
      roundTrip: quote.rideRequest.roundTrip,
      durationHours: quote.rideRequest.durationHours,
    },
  }
})
