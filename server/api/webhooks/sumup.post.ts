import { prisma } from '~/server/utils/prisma'
import { getValidAccessToken, getCheckout } from '~/server/utils/sumup'
import { confirmBookingFromQuote } from '~/server/utils/booking-confirm'

// Webhook SumUp (statut des Hosted Checkouts). SumUp notifie ici quand un checkout
// change d'état. On ne fait pas confiance au corps : on relit le statut AUTHENTIQUE
// via l'API avec le jeton du chauffeur, puis on confirme la course si PAID.
// Idempotence garantie par WebhookEvent + l'unicité du Booking sur le devis.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; event_type?: string }>(event).catch(() => null)
  const checkoutId = body?.id
  if (!checkoutId) {
    throw createError({ statusCode: 400, statusMessage: 'Payload SumUp invalide.' })
  }

  // Idempotence : un même checkout peut être notifié plusieurs fois.
  const eventId = `sumup_${checkoutId}_${body?.event_type ?? 'checkout'}`
  const already = await prisma.webhookEvent.findUnique({ where: { id: eventId } })
  if (already?.processedAt) return { received: true, duplicate: true }
  await prisma.webhookEvent.upsert({
    where: { id: eventId },
    update: {},
    create: { id: eventId, provider: 'sumup', type: body?.event_type ?? 'checkout.updated' },
  })

  const quote = await prisma.quote.findUnique({
    where: { sumupCheckoutId: checkoutId },
    include: { driver: true, rideRequest: true, booking: true },
  })

  if (quote && !quote.booking) {
    const token = await getValidAccessToken(quote.driver)
    const checkout = await getCheckout(token, checkoutId)
    if (checkout.status === 'PAID') {
      const paidTx = checkout.transactions?.find((t) => t.status === 'SUCCESSFUL') ?? checkout.transactions?.[0]
      await confirmBookingFromQuote(quote, {
        provider: 'SUMUP',
        amountCents: quote.amountCents,
        applicationFeeCents: quote.applicationFeeCents,
        currency: quote.currency,
        sumupCheckoutId: checkoutId,
        sumupTransactionCode: paidTx?.transaction_code,
      })
    }
  }

  await prisma.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } })
  return { received: true }
})
