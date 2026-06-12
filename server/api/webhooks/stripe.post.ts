import type Stripe from 'stripe'
import { getStripe } from '~/server/utils/stripe'
import { prisma } from '~/server/utils/prisma'
import { bookingSlot } from '~/server/utils/calendar'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { signClientToken } from '~/server/utils/tokens'

// Webhook Stripe (paiements). Vérifie la signature, garantit l'idempotence via
// WebhookEvent, puis confirme la course : Booking + CalendarEvent + Payment + email.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const signature = getHeader(event, 'stripe-signature')
  const rawBody = await readRawBody(event)
  if (!signature || !rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Signature manquante.' })
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      config.stripeWebhookSecret,
    )
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Signature invalide.' })
  }

  // Idempotence : on n'enregistre qu'une fois chaque événement.
  const already = await prisma.webhookEvent.findUnique({ where: { id: stripeEvent.id } })
  if (already?.processedAt) return { received: true, duplicate: true }
  await prisma.webhookEvent.upsert({
    where: { id: stripeEvent.id },
    update: {},
    create: { id: stripeEvent.id, provider: 'stripe', type: stripeEvent.type },
  })

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session
    await confirmBookingFromSession(session, config.linkTokenSecret, config.public.appBaseUrl)
  }

  await prisma.webhookEvent.update({
    where: { id: stripeEvent.id },
    data: { processedAt: new Date() },
  })
  return { received: true }
})

async function confirmBookingFromSession(
  session: Stripe.Checkout.Session,
  linkSecret: string,
  appBaseUrl: string,
): Promise<void> {
  const quoteId = session.metadata?.quoteId
  if (!quoteId || session.payment_status !== 'paid') return

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote || quote.booking) return // déjà confirmé

  const req = quote.rideRequest
  if (!req.customerId) return

  const serviceDurationSeconds =
    req.type === 'TRANSFER'
      ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
      : (req.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, req.scheduledAt, serviceDurationSeconds)

  // Transaction : course + créneau calendrier + paiement, et devis ACCEPTED.
  const booking = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        driverId: quote.driverId,
        quoteId: quote.id,
        customerId: req.customerId!,
        status: 'CONFIRMED',
        scheduledAt: req.scheduledAt,
        amountCents: quote.amountCents,
        calendarEvent: {
          create: {
            driverId: quote.driverId,
            type: 'BOOKING',
            source: 'INTERNAL',
            title: `Course — ${req.customerName}`,
            startAt: slot.startAt,
            endAt: slot.endAt,
          },
        },
      },
    })
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    })
    await tx.payment.create({
      data: {
        driverId: quote.driverId,
        bookingId: booking.id,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        amountCents: quote.amountCents,
        applicationFeeCents: quote.applicationFeeCents,
        currency: quote.currency,
        status: 'PAID',
      },
    })
    return booking
  })

  // Email de confirmation au client avec lien de gestion.
  const manageToken = await signClientToken({ purpose: 'manage', ref: booking.id }, linkSecret, '90d')
  const tpl = emailTemplates.paymentConfirmed({
    driverName: quote.driver.displayName,
    amountCents: quote.amountCents,
    currency: quote.currency,
    scheduledAt: req.scheduledAt,
    manageUrl: `${appBaseUrl}/reservation/${manageToken}`,
    driverPhone: quote.driver.phone,
    driverEmail: quote.driver.contactEmail,
    siren: quote.driver.siren,
    companyName: quote.driver.companyName,
    vehicleMake: quote.driver.vehicleMake,
    vehicleModel: quote.driver.vehicleModel,
  })
  await sendEmail({ to: req.customerEmail, ...tpl })
}
