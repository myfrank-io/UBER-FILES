import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { computeRefund } from '~/lib/cancellation'
import { createRefund } from '~/server/utils/stripe'
import { sendEmail, emailTemplates } from '~/server/utils/email'

// Annulation d'une réservation par le client. Calcule le remboursement selon la
// politique, déclenche le remboursement Stripe, libère le créneau calendrier.
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
      payments: { where: { status: 'PAID' } },
    },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  if (booking.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'Réservation déjà annulée.' })
  }

  const policy = booking.driver.cancellationPolicy ?? { freeUntilHours: 24, retainedPercent: 50 }
  const refund = computeRefund(booking.amountCents, booking.scheduledAt, policy)
  const payment = booking.payments[0]

  // Remboursement Stripe (si paiement présent et montant > 0).
  if (payment?.stripePaymentIntentId && refund.refundCents > 0 && config.stripeSecretKey) {
    const stripeRefund = await createRefund(payment.stripePaymentIntentId, refund.refundCents)
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        bookingId: booking.id,
        stripeRefundId: stripeRefund.id,
        amountCents: refund.refundCents,
        reason: 'Annulation client',
        status: 'SUCCEEDED',
      },
    })
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: refund.refundCents === booking.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    })
  }

  // Annulation + libération du créneau (transaction).
  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } }),
    prisma.quote.update({ where: { id: booking.quoteId }, data: { status: 'CANCELLED' } }),
    prisma.calendarEvent.deleteMany({ where: { bookingId: booking.id } }),
  ])

  // Email d'annulation au client
  await sendEmail({
    to: booking.quote.rideRequest.customerEmail,
    ...emailTemplates.cancelled({
      driverName: booking.driver.displayName,
      refundCents: refund.refundCents,
      currency: booking.quote.currency,
    }),
  })

  return { ok: true, refundCents: refund.refundCents, retainedCents: refund.retainedCents }
})
