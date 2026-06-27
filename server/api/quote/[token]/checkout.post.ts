import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { createCheckoutSession } from '~/server/utils/stripe'
import { getValidAccessToken, createHostedCheckout } from '~/server/utils/sumup'

// Crée la session de paiement pour un devis validé et renvoie l'URL hébergée.
// Bascule entre Stripe et SumUp selon le prestataire configuré par le chauffeur.
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

  const description =
    quote.rideRequest.type === 'TRANSFER'
      ? `Transfert — ${quote.driver.displayName}`
      : `Mise à disposition — ${quote.driver.displayName}`

  const successUrl = `${config.public.appBaseUrl}/devis/${token}?paid=1`
  const cancelUrl = `${config.public.appBaseUrl}/devis/${token}`

  // ─── SumUp (chauffeur merchant of record) ───────────────────────────────
  if (quote.driver.paymentProvider === 'SUMUP') {
    if (!quote.driver.sumupConnected || !quote.driver.sumupMerchantCode) {
      throw createError({ statusCode: 503, statusMessage: 'Le chauffeur n’a pas connecté son compte SumUp.' })
    }
    const accessToken = await getValidAccessToken(quote.driver)
    const checkout = await createHostedCheckout({
      accessToken,
      merchantCode: quote.driver.sumupMerchantCode,
      checkoutReference: quote.id,
      amount: quote.amountCents / 100, // SumUp attend des unités majeures (euros)
      currency: quote.currency,
      description,
      returnUrl: `${config.public.appBaseUrl}/api/webhooks/sumup`,
      redirectUrl: successUrl,
    })
    // Mémorise l'id du checkout pour que le webhook retrouve ce devis.
    await prisma.quote.update({ where: { id: quote.id }, data: { sumupCheckoutId: checkout.id } })
    if (!checkout.hosted_checkout_url) {
      throw createError({ statusCode: 502, statusMessage: 'SumUp n’a pas renvoyé d’URL de paiement.' })
    }
    return { url: checkout.hosted_checkout_url }
  }

  // ─── Stripe (destination charge) ────────────────────────────────────────
  if (!quote.driver.stripeAccountId || !quote.driver.stripeChargesEnabled) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Le chauffeur n’a pas finalisé sa configuration de paiement.',
    })
  }
  const session = await createCheckoutSession({
    quoteId: quote.id,
    amountCents: quote.amountCents,
    applicationFeeCents: quote.applicationFeeCents,
    currency: quote.currency,
    connectedAccountId: quote.driver.stripeAccountId,
    customerEmail: quote.rideRequest.customerEmail,
    description,
    successUrl,
    cancelUrl,
  })
  return { url: session.url }
})
