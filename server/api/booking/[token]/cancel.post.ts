import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { computeRefund } from '~/lib/cancellation'
import { createRefund } from '~/server/utils/stripe'
import { getValidAccessToken, refundTransaction } from '~/server/utils/sumup'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { notifyDriver } from '~/server/utils/notify-driver'
import { formatMoney } from '~/lib/money'
import { isOnSiteMethod } from '~/lib/payment-methods'

// Annulation d'une réservation par le client. Rembourse le paiement en ligne selon
// la politique du chauffeur, clôt un éventuel encaissement sur place en attente,
// libère le créneau calendrier et prévient les deux parties.
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
  if (booking.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'Réservation déjà annulée.' })
  }

  // Situation de paiement : payé en ligne (remboursable automatiquement), payé sur
  // place (le remboursement éventuel se règle entre client et chauffeur), ou rien
  // d'encaissé (encaissement sur place encore en attente).
  const paidPayment = booking.payments.find((p) => p.status === 'PAID')
  const paidOnline = Boolean(paidPayment && !isOnSiteMethod(paidPayment.method))

  const policy = booking.driver.cancellationPolicy ?? { freeUntilHours: 24, retainedPercent: 50 }
  // La retenue ne s'applique qu'à un paiement en ligne : sans encaissement, il n'y a
  // rien à rembourser ni à retenir.
  const refund = paidOnline
    ? computeRefund(booking.amountCents, booking.scheduledAt, policy)
    : { refundCents: 0, retainedCents: 0, isFree: true }

  // Remboursement automatique du paiement en ligne, selon le prestataire.
  let refunded = false
  if (paidOnline && paidPayment && refund.refundCents > 0) {
    let refundRef: { stripeRefundId?: string; sumupRefundTxId?: string } = {}

    if (paidPayment.provider === 'SUMUP' && paidPayment.sumupTransactionCode) {
      // SumUp rembourse en unités majeures (euros) sur la transaction d'origine.
      const accessToken = await getValidAccessToken(booking.driver)
      await refundTransaction(accessToken, paidPayment.sumupTransactionCode, refund.refundCents / 100)
      refundRef = { sumupRefundTxId: paidPayment.sumupTransactionCode }
      refunded = true
    } else if (paidPayment.stripePaymentIntentId && config.stripeSecretKey) {
      const stripeRefund = await createRefund(paidPayment.stripePaymentIntentId, refund.refundCents)
      refundRef = { stripeRefundId: stripeRefund.id }
      refunded = true
    }

    if (refunded) {
      await prisma.refund.create({
        data: {
          paymentId: paidPayment.id,
          bookingId: booking.id,
          ...refundRef,
          amountCents: refund.refundCents,
          reason: 'Annulation client',
          status: 'SUCCEEDED',
        },
      })
      await prisma.payment.update({
        where: { id: paidPayment.id },
        data: { status: refund.refundCents === booking.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      })
    }
  }

  // Annulation + libération du créneau + clôture des encaissements sur place en
  // attente (sinon la course annulée resterait « à encaisser » côté chauffeur).
  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } }),
    prisma.quote.update({ where: { id: booking.quoteId }, data: { status: 'CANCELLED' } }),
    prisma.payment.updateMany({
      where: { bookingId: booking.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    }),
    prisma.calendarEvent.deleteMany({ where: { bookingId: booking.id } }),
  ])

  // Email d'annulation au client, adapté à sa situation de paiement.
  const paymentSituation = paidOnline
    ? refunded
      ? ('REFUNDED' as const)
      : ('NO_REFUND' as const)
    : paidPayment
      ? ('PAID_ON_SITE' as const)
      : ('NOTHING_PAID' as const)
  await sendEmail({
    to: booking.quote.rideRequest.customerEmail,
    ...emailTemplates.cancelled({
      driverName: booking.driver.displayName,
      refundCents: refund.refundCents,
      currency: booking.quote.currency,
      situation: paymentSituation,
    }),
  })

  // Notification chauffeur : email (canal principal) + Telegram si réactivé.
  const req = booking.quote.rideRequest
  const scheduledStr = booking.scheduledAt.toLocaleString('fr-FR')
  const refundStr = refunded
    ? `Remboursement : ${formatMoney(refund.refundCents, booking.quote.currency)}`
    : paidPayment
      ? 'Réglé sur place : remboursement éventuel à voir directement avec le client.'
      : 'Rien n’avait été encaissé : aucun remboursement à faire.'

  await notifyDriver(booking.driver, {
    email: emailTemplates.bookingCancelledDriver({
      customerName: req.customerName,
      scheduledAt: booking.scheduledAt,
      refundCents: refunded ? refund.refundCents : 0,
      currency: booking.quote.currency,
    }),
    telegram: {
      text:
        `❌ <b>Annulation client</b>\n` +
        `Client : ${req.customerName}\n` +
        `Course prévue le ${scheduledStr}\n` +
        `${refundStr}`,
    },
  })

  return { ok: true, refundCents: refund.refundCents, retainedCents: refund.retainedCents }
})
