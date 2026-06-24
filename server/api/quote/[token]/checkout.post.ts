import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { createCheckoutSession } from '~/server/utils/stripe'

// Crée la session de paiement Stripe pour un devis validé. Le client est redirigé vers Checkout.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'quote') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: payload.ref },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.booking || quote.status === 'ACCEPTED') {
    throw createError({ statusCode: 409, statusMessage: 'Course déjà confirmée.' })
  }
  if (quote.status !== 'SENT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis ne peut pas être payé.' })
  }
  if (quote.expiresAt.getTime() < Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'Ce devis a expiré.' })
  }
  if (!quote.driver.paymentMethods.includes('STRIPE_PREPAYMENT')) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le chauffeur ne propose pas le paiement en ligne pour cette course.',
    })
  }
  if (!quote.driver.stripeAccountId || !quote.driver.stripeChargesEnabled) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Le chauffeur n’a pas finalisé sa configuration de paiement.',
    })
  }

  const description =
    quote.rideRequest.type === 'TRANSFER'
      ? `Transfert — ${quote.driver.displayName}`
      : `Mise à disposition — ${quote.driver.displayName}`

  const session = await createCheckoutSession({
    quoteId: quote.id,
    amountCents: quote.amountCents,
    applicationFeeCents: quote.applicationFeeCents,
    currency: quote.currency,
    connectedAccountId: quote.driver.stripeAccountId,
    customerEmail: quote.rideRequest.customerEmail,
    description,
    successUrl: `${config.public.appBaseUrl}/devis/${token}?paid=1`,
    cancelUrl: `${config.public.appBaseUrl}/devis/${token}`,
  })

  // Le Payment et le Booking sont créés à la confirmation (webhook), une fois le
  // paiement effectivement abouti — c'est la règle produit : pas de blocage avant paiement.
  return { url: session.url }
})
