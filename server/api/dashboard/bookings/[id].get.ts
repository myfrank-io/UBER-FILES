import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { computeRefund } from '~/lib/cancellation'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: true,
      quote: { include: { rideRequest: true } },
      payments: true,
      refunds: true,
      driver: { include: { cancellationPolicy: true } },
    },
  })

  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }

  const policy = booking.driver.cancellationPolicy ?? { freeUntilHours: 24, retainedPercent: 50 }
  const refund = computeRefund(booking.amountCents, booking.scheduledAt, policy)
  const req = booking.quote.rideRequest

  return {
    id: booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledAt,
    amountCents: booking.amountCents,
    currency: booking.quote.currency,
    createdAt: booking.createdAt,
    customer: {
      name: booking.customer.name,
      phone: booking.customer.phone,
      email: booking.customer.email,
    },
    ride: {
      type: req.type,
      pickupAddress: req.pickupAddress,
      dropoffAddress: req.dropoffAddress,
      roundTrip: req.roundTrip,
      durationHours: req.durationHours,
      distanceMeters: req.distanceMeters,
      durationSeconds: req.durationSeconds,
      notes: req.notes,
    },
    payments: booking.payments.map((p) => ({
      id: p.id,
      status: p.status,
      method: p.method,
      amountCents: p.amountCents,
      createdAt: p.createdAt,
    })),
    refunds: booking.refunds.map((r) => ({
      id: r.id,
      status: r.status,
      amountCents: r.amountCents,
      createdAt: r.createdAt,
    })),
    cancellation: {
      currentRefundCents: refund.refundCents,
      isFreeNow: refund.isFree,
      freeUntilHours: policy.freeUntilHours,
      retainedPercent: policy.retainedPercent,
    },
  }
})
