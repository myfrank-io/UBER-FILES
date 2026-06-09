import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { computeRefund } from '~/lib/cancellation'

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
    include: { driver: { include: { cancellationPolicy: true } }, quote: { include: { rideRequest: true } } },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })

  const policy = booking.driver.cancellationPolicy ?? { freeUntilHours: 24, retainedPercent: 50 }
  const refund = computeRefund(booking.amountCents, booking.scheduledAt, policy)
  const req = booking.quote.rideRequest

  return {
    status: booking.status,
    amountCents: booking.amountCents,
    currency: booking.quote.currency,
    scheduledAt: booking.scheduledAt,
    driver: { displayName: booking.driver.displayName },
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
