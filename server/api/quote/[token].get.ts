import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'

// Consultation d'un devis par le client via son jeton signé (sans compte).
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

  const expired = quote.status === 'SENT' && quote.expiresAt.getTime() < Date.now()

  return {
    id: quote.id,
    status: expired ? 'EXPIRED' : quote.status,
    amountCents: quote.amountCents,
    currency: quote.currency,
    breakdown: quote.breakdown,
    expiresAt: quote.expiresAt,
    alreadyPaid: quote.status === 'ACCEPTED' || Boolean(quote.booking),
    driver: { displayName: quote.driver.displayName, slug: quote.driver.slug },
    ride: {
      type: quote.rideRequest.type,
      scheduledAt: quote.rideRequest.scheduledAt,
      pickupAddress: quote.rideRequest.pickupAddress,
      dropoffAddress: quote.rideRequest.dropoffAddress,
      roundTrip: quote.rideRequest.roundTrip,
      durationHours: quote.rideRequest.durationHours,
    },
  }
})
