import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { computeRefund } from '~/lib/cancellation'
import { isOnSiteMethod, type PaymentMethod } from '~/lib/payment-methods'

// Consultation d'une réservation par le client via son jeton de gestion signé.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'manage') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const booking = await prisma.booking.findUnique({
    where: { id: payload.ref },
    include: {
      driver: { include: { cancellationPolicy: true } },
      quote: { include: { rideRequest: true } },
      payments: true,
    },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })

  const policy = booking.driver.cancellationPolicy ?? { freeUntilHours: 24, retainedPercent: 50 }
  const refund = computeRefund(booking.amountCents, booking.scheduledAt, policy)
  const req = booking.quote.rideRequest
  // Payé en ligne ? Détermine le message d'annulation (remboursement vs simple
  // annulation sans prélèvement).
  const paidOnline = booking.payments.some(
    (p) => p.status === 'PAID' && !isOnSiteMethod(p.method as PaymentMethod),
  )
  // Situation de règlement affichée au client : payé (en ligne ou sur place) ou
  // encaissement sur place prévu le jour J (avec le moyen).
  const paidPayment = booking.payments.find((p) => p.status === 'PAID')
  const pendingOnSite = booking.payments.find(
    (p) => p.status === 'PENDING' && isOnSiteMethod(p.method as PaymentMethod),
  )

  return {
    status: booking.status,
    paidOnline,
    payment: {
      paid: Boolean(paidPayment),
      paidOnline,
      // Moyen du règlement effectué, ou prévu sur place (null si rien à afficher).
      method: (paidPayment ?? pendingOnSite)?.method ?? null,
    },
    amountCents: booking.amountCents,
    currency: booking.quote.currency,
    scheduledAt: booking.scheduledAt,
    driver: {
      displayName: booking.driver.displayName,
      phone: booking.driver.phone,
      contactEmail: booking.driver.contactEmail,
    },
    ride: {
      type: req.type,
      pickupAddress: req.pickupAddress,
      dropoffAddress: req.dropoffAddress,
      roundTrip: req.roundTrip,
      durationHours: req.durationHours,
    },
    cancellation: {
      freeUntilHours: policy.freeUntilHours,
      retainedPercent: policy.retainedPercent,
      currentRefundCents: refund.refundCents,
      isFreeNow: refund.isFree,
    },
  }
})
