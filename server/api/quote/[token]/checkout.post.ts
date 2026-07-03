import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { createQuoteCheckoutUrl } from '~/server/utils/checkout'

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

  const url = await createQuoteCheckoutUrl(quote, token)
  return { url }
})
