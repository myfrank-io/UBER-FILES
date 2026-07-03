import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { createCheckoutSession } from './stripe'
import { getValidAccessToken, createHostedCheckout, getCheckout, deactivateCheckout } from './sumup'

// Création de la session de paiement en ligne d'un devis (Stripe ou SumUp selon
// le prestataire du chauffeur). Partagé entre la page devis (paiement différé) et
// la réservation à paiement immédiat (le client va droit au paiement, sans page
// devis intermédiaire).

type QuoteForCheckout = Prisma.QuoteGetPayload<{
  include: { driver: true; rideRequest: true }
}>

/**
 * Crée la session de paiement hébergée pour un devis SENT et renvoie l'URL vers
 * laquelle rediriger le client. Le `token` (jeton signé du devis) sert à construire
 * les URLs de retour vers la page devis (succès / annulation).
 */
export async function createQuoteCheckoutUrl(
  quote: QuoteForCheckout,
  token: string,
): Promise<string> {
  const config = useRuntimeConfig()

  if (!quote.driver.paymentMethods.includes('STRIPE_PREPAYMENT')) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le chauffeur ne propose pas le paiement en ligne pour cette course.',
    })
  }

  const description =
    quote.rideRequest.type === 'TRANSFER'
      ? `Transfert — ${quote.driver.displayName}`
      : `Mise à disposition — ${quote.driver.displayName}`

  const cancelUrl = `${config.public.appBaseUrl}/devis/${token}`

  // ─── SumUp (chauffeur merchant of record) ───────────────────────────────
  if (quote.driver.paymentProvider === 'SUMUP') {
    // SumUp redirige vers cette URL même si le client quitte sans payer : la page
    // devis vérifie donc le statut réel du checkout avant d'afficher « payé ».
    const successUrl = `${config.public.appBaseUrl}/devis/${token}?paid=1`
    if (!quote.driver.sumupConnected || !quote.driver.sumupMerchantCode) {
      throw createError({ statusCode: 503, statusMessage: 'Le chauffeur n’a pas connecté son compte SumUp.' })
    }
    const accessToken = await getValidAccessToken(quote.driver)

    // Un checkout existe déjà pour ce devis (le client a déjà tenté de payer) :
    // SumUp refuse d'en recréer un avec la même référence (409 DUPLICATED_CHECKOUT).
    // On vérifie d'abord son statut : s'il est déjà payé, retour direct au succès ;
    // sinon on le DÉSACTIVE (un paiement sur l'ancien lien ne serait jamais
    // rapproché du devis) puis on en crée un nouveau avec une référence unique.
    let checkoutReference = quote.id
    if (quote.sumupCheckoutId) {
      try {
        const existing = await getCheckout(accessToken, quote.sumupCheckoutId)
        if (existing.status === 'PAID') return successUrl
        await deactivateCheckout(accessToken, quote.sumupCheckoutId)
      } catch {
        // Statut/désactivation indisponibles : on crée quand même un nouveau
        // checkout (le webhook ignorera un éventuel paiement sur l'ancien).
      }
      checkoutReference = `${quote.id}-${randomUUID().slice(0, 8)}`
    }

    const checkout = await createHostedCheckout({
      accessToken,
      merchantCode: quote.driver.sumupMerchantCode,
      checkoutReference,
      amount: quote.amountCents / 100, // SumUp attend des unités majeures (euros)
      currency: quote.currency,
      description,
      returnUrl: `${config.public.appBaseUrl}/api/webhooks/sumup`,
      redirectUrl: successUrl,
    })
    // Mémorise l'id du dernier checkout pour que le webhook et la vérification de
    // statut retrouvent ce devis (l'ancien checkout abandonné devient inutilisé).
    await prisma.quote.update({ where: { id: quote.id }, data: { sumupCheckoutId: checkout.id } })
    if (!checkout.hosted_checkout_url) {
      throw createError({ statusCode: 502, statusMessage: 'SumUp n’a pas renvoyé d’URL de paiement.' })
    }
    return checkout.hosted_checkout_url
  }

  // ─── Stripe (destination charge) ────────────────────────────────────────
  if (!quote.driver.stripeAccountId || !quote.driver.stripeChargesEnabled) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Le chauffeur n’a pas finalisé sa configuration de paiement.',
    })
  }
  // `{CHECKOUT_SESSION_ID}` est remplacé par Stripe : la page devis relit ainsi
  // le vrai statut de la session au retour, plutôt que de se fier au seul `paid=1`.
  const successUrl = `${config.public.appBaseUrl}/devis/${token}?paid=1&session_id={CHECKOUT_SESSION_ID}`
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
  if (!session.url) {
    throw createError({ statusCode: 502, statusMessage: 'Stripe n’a pas renvoyé d’URL de paiement.' })
  }
  return session.url
}
