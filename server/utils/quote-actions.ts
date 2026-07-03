import { prisma } from './prisma'
import { signClientToken } from './tokens'
import { sendEmail, emailTemplates } from './email'
import { bookingSlot, findConflict } from './calendar'
import { canAcceptBookings } from './driver'

// Actions métier sur les devis, partagées entre le back-office et le bot Telegram.

export interface SendQuoteResult {
  ok: boolean
  payUrl: string
  amountCents: number
}

/**
 * Valide (et éventuellement ajuste) un devis, le passe en SENT, et envoie au client
 * l'email avec le lien de paiement. Vérifie l'absence de conflit calendrier.
 */
export async function sendQuoteToClient(
  quoteId: string,
  driverId: string,
  adjustedAmountCents?: number,
): Promise<SendQuoteResult> {
  const config = useRuntimeConfig()
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, driverId },
    include: { driver: true, rideRequest: true },
  })
  if (!quote) {
    throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  }
  if (quote.status !== 'DRAFT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }

  // Re-vérifier le conflit calendrier au moment de la validation.
  const serviceDurationSeconds =
    quote.rideRequest.type === 'TRANSFER'
      ? (quote.rideRequest.durationSeconds ?? 0) * (quote.rideRequest.roundTrip ? 2 : 1)
      : (quote.rideRequest.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, quote.rideRequest.scheduledAt, serviceDurationSeconds)
  const conflict = await findConflict(driverId, slot)
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage: `Conflit calendrier avec « ${conflict.title ?? 'événement'} ».`,
    })
  }

  const amountCents = adjustedAmountCents ?? quote.amountCents
  const expiresAt = new Date(Date.now() + quote.driver.quoteExpiryHours * 3_600_000)

  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: { status: 'SENT', amountCents, sentAt: new Date(), expiresAt },
  })

  const token = await signClientToken(
    { purpose: 'quote', ref: updated.id },
    config.linkTokenSecret,
    `${quote.driver.quoteExpiryHours}h`,
  )
  const payUrl = `${config.public.appBaseUrl}/devis/${token}`

  // Le chauffeur propose-t-il le prépaiement en ligne ? (adapte le libellé du bouton)
  const prepayment =
    quote.driver.paymentMethods.includes('STRIPE_PREPAYMENT') && canAcceptBookings(quote.driver)
  const tpl = emailTemplates.quoteSent({
    driverName: quote.driver.displayName,
    amountCents,
    currency: quote.currency,
    payUrl,
    expiresAt,
    prepayment,
  })
  await sendEmail({ to: quote.rideRequest.customerEmail, ...tpl })

  return { ok: true, payUrl, amountCents }
}

/** Refuse un devis (DRAFT → REJECTED). */
export async function rejectQuote(quoteId: string, driverId: string): Promise<void> {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, driverId } })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.status !== 'DRAFT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }
  await prisma.quote.update({ where: { id: quote.id }, data: { status: 'REJECTED' } })
  await prisma.rideRequest.update({
    where: { id: quote.rideRequestId },
    data: { status: 'CANCELLED' },
  })
}
