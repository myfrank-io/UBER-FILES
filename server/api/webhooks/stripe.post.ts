import type Stripe from 'stripe'
import { getStripe } from '~/server/utils/stripe'
import { prisma } from '~/server/utils/prisma'
import { confirmBookingFromQuote } from '~/server/utils/booking-confirm'

// Webhook Stripe (paiements). Vérifie la signature, garantit l'idempotence via
// WebhookEvent, puis confirme la course via le chemin partagé (Booking +
// CalendarEvent + Payment + emails client et chauffeur).
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
    await confirmBookingFromSession(session)
  }

  await prisma.webhookEvent.update({
    where: { id: stripeEvent.id },
    data: { processedAt: new Date() },
  })
  return { received: true }
})

async function confirmBookingFromSession(session: Stripe.Checkout.Session): Promise<void> {
  const quoteId = session.metadata?.quoteId
  if (!quoteId || session.payment_status !== 'paid') return

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote) return

  // Chemin partagé avec SumUp : idempotent (no-op si déjà confirmé).
  await confirmBookingFromQuote(quote, {
    provider: 'STRIPE',
    amountCents: quote.amountCents,
    applicationFeeCents: quote.applicationFeeCents,
    currency: quote.currency,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
  })
}
