import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { createQuoteCheckoutUrl } from '~/server/utils/checkout'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { isQuotePaymentExpired } from '~/server/utils/quote-status'

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
  // Expiré si le délai est dépassé ou si la date de la course est déjà passée.
  if (isQuotePaymentExpired(quote)) {
    throw createError({ statusCode: 410, statusMessage: 'Ce devis a expiré.' })
  }

  // Le créneau peut avoir été pris entre l'envoi du devis et le paiement (autre
  // course confirmée, indisponibilité saisie…) : on re-vérifie avant d'encaisser.
  const req = quote.rideRequest
  const serviceDurationSeconds =
    req.type === 'TRANSFER'
      ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
      : (req.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, req.scheduledAt, serviceDurationSeconds)
  const conflict = await findConflict(quote.driverId, slot)
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ce créneau n’est plus disponible. Merci de contacter le chauffeur.',
    })
  }

  const url = await createQuoteCheckoutUrl(quote, token)
  return { url }
})
