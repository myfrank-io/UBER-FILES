import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { createRefund } from '~/server/utils/stripe'
import { getValidAccessToken, refundTransaction } from '~/server/utils/sumup'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { isOnSiteMethod } from '~/lib/payment-methods'

// Annulation d'une course à l'initiative du CHAUFFEUR (imprévu, indisponibilité).
// L'annulation étant de son fait, le client est INTÉGRALEMENT remboursé (aucune
// retenue), le créneau est libéré et le client est prévenu par email.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  const config = useRuntimeConfig()

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { driver: true, quote: { include: { rideRequest: true } }, payments: true },
  })
  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }
  if (booking.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'Réservation déjà annulée.' })
  }
  if (booking.status === 'COMPLETED') {
    throw createError({ statusCode: 409, statusMessage: 'Une course terminée ne peut plus être annulée.' })
  }

  const paidPayment = booking.payments.find((p) => p.status === 'PAID')
  const paidOnline = Boolean(paidPayment && !isOnSiteMethod(paidPayment.method))

  // Remboursement INTÉGRAL du paiement en ligne (annulation du fait du chauffeur).
  let refunded = false
  if (paidOnline && paidPayment) {
    let refundRef: { stripeRefundId?: string; sumupRefundTxId?: string } = {}
    if (paidPayment.provider === 'SUMUP' && paidPayment.sumupTransactionCode) {
      const accessToken = await getValidAccessToken(booking.driver)
      await refundTransaction(accessToken, paidPayment.sumupTransactionCode, paidPayment.amountCents / 100)
      refundRef = { sumupRefundTxId: paidPayment.sumupTransactionCode }
      refunded = true
    } else if (paidPayment.stripePaymentIntentId && config.stripeSecretKey) {
      const stripeRefund = await createRefund(paidPayment.stripePaymentIntentId, paidPayment.amountCents)
      refundRef = { stripeRefundId: stripeRefund.id }
      refunded = true
    }
    if (refunded) {
      await prisma.refund.create({
        data: {
          paymentId: paidPayment.id,
          bookingId: booking.id,
          ...refundRef,
          amountCents: paidPayment.amountCents,
          reason: 'Annulation chauffeur',
          status: 'SUCCEEDED',
        },
      })
      await prisma.payment.update({ where: { id: paidPayment.id }, data: { status: 'REFUNDED' } })
    }
  }

  // Annulation + libération du créneau + clôture des encaissements sur place en attente.
  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } }),
    prisma.quote.update({ where: { id: booking.quoteId }, data: { status: 'CANCELLED' } }),
    prisma.payment.updateMany({
      where: { bookingId: booking.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    }),
    prisma.calendarEvent.deleteMany({ where: { bookingId: booking.id } }),
  ])

  // Email d'excuse + remboursement au client (n'empêche pas l'annulation en cas d'échec).
  try {
    const req = booking.quote.rideRequest
    await sendEmail({
      to: req.customerEmail,
      ...emailTemplates.bookingCancelledByDriver({
        customerName: req.customerName,
        driverName: booking.driver.displayName,
        scheduledAt: booking.scheduledAt,
        timezone: booking.driver.timezone,
        refunded,
        refundCents: refunded ? booking.amountCents : 0,
        currency: booking.quote.currency,
        paidOnSite: Boolean(paidPayment && !paidOnline),
        rebookUrl: `${config.public.appBaseUrl}/${booking.driver.slug}`,
      }),
    })
  } catch (err) {
    console.error('[driver-cancel] échec email client', err)
  }

  return { ok: true, refunded, refundCents: refunded ? booking.amountCents : 0 }
})
