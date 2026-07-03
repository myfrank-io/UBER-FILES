import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { getValidAccessToken, getCheckout } from '~/server/utils/sumup'
import { getStripe } from '~/server/utils/stripe'
import { confirmBookingFromQuote } from '~/server/utils/booking-confirm'

// Vérifie l'état RÉEL du paiement d'un devis, sans se fier au retour de l'URL.
// Nécessaire car SumUp renvoie le client sur l'URL de redirection même s'il a
// quitté sans payer : on interroge donc le prestataire pour connaître la vérité,
// et on confirme la course si (et seulement si) le paiement est effectif.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret as string)
  if (!payload || payload.purpose !== 'quote') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }
  const sessionId = getQuery(event).session_id as string | undefined

  const quote = await prisma.quote.findUnique({
    where: { id: payload.ref },
    include: { driver: true, rideRequest: true, booking: { include: { payments: true } } },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })

  // Déjà confirmé + réglé en ligne (le webhook est passé) : c'est payé, point final.
  if (quote.booking?.payments.some((p) => p.status === 'PAID')) {
    return { paid: true }
  }

  // Pas encore de course confirmée : on demande au prestataire le statut authentique.
  // Le webhook peut être en retard (paiement réel) OU le client a quitté sans payer.
  if (!quote.booking) {
    try {
      if (quote.driver.paymentProvider === 'SUMUP' && quote.sumupCheckoutId) {
        const accessToken = await getValidAccessToken(quote.driver)
        const checkout = await getCheckout(accessToken, quote.sumupCheckoutId)
        if (checkout.status === 'PAID') {
          const paidTx =
            checkout.transactions?.find((t) => t.status === 'SUCCESSFUL') ?? checkout.transactions?.[0]
          await confirmBookingFromQuote(quote, {
            provider: 'SUMUP',
            amountCents: quote.amountCents,
            applicationFeeCents: quote.applicationFeeCents,
            currency: quote.currency,
            sumupCheckoutId: quote.sumupCheckoutId,
            sumupTransactionCode: paidTx?.transaction_code,
          })
          return { paid: true }
        }
      } else if (quote.driver.paymentProvider === 'STRIPE' && sessionId) {
        const session = await getStripe().checkout.sessions.retrieve(sessionId)
        if (session.metadata?.quoteId === quote.id && session.payment_status === 'paid') {
          await confirmBookingFromQuote(quote, {
            provider: 'STRIPE',
            amountCents: quote.amountCents,
            applicationFeeCents: quote.applicationFeeCents,
            currency: quote.currency,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          })
          return { paid: true }
        }
      }
    } catch {
      // Vérification momentanément indisponible : on répond « pas encore payé »,
      // la page réessaiera (le webhook finira de toute façon par confirmer).
    }
  }

  return { paid: false }
})
