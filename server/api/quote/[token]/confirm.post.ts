import { z } from 'zod'
import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { confirmQuoteOnSite } from '~/server/utils/booking-onsite'
import { driverBookingMode } from '~/server/utils/driver'
import { ONSITE_METHODS, type PaymentMethod } from '~/lib/payment-methods'

// Confirme une course SANS prépaiement en ligne : le client réserve et règle sur
// place le jour de la course (carte, espèces ou chèque selon ce qu'accepte le
// chauffeur). Crée Booking (CONFIRMED) + CalendarEvent + Payment (PENDING, encaissé
// le jour J), passe le devis en ACCEPTED et envoie les emails de confirmation.
const schema = z.object({
  method: z.enum(ONSITE_METHODS as [string, ...string[]]).optional(),
})

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'quote') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Moyen de paiement invalide.' })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: payload.ref },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.booking || quote.status === 'ACCEPTED') {
    throw createError({ statusCode: 409, statusMessage: 'Course déjà confirmée.' })
  }
  // Le client ne peut confirmer qu'un devis qui lui a été envoyé (un devis en
  // attente de validation chauffeur ne se confirme pas en contournant l'UI).
  if (quote.status !== 'SENT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis ne peut pas être confirmé.' })
  }

  // Le chauffeur accepte-t-il l'encaissement sur place ? (vide quand le paiement
  // en ligne est exigé : la confirmation « sur place » n'est alors pas ouverte,
  // même si l'UI est contournée.)
  const accepted = driverBookingMode(quote.driver).onSiteMethods
  if (accepted.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le chauffeur ne propose pas le paiement sur place pour cette course.',
    })
  }
  // Moyen choisi par le client (s'il l'a précisé) ou premier moyen accepté.
  const method = (body.data.method as PaymentMethod | undefined) ?? accepted[0]!
  if (!accepted.includes(method)) {
    throw createError({ statusCode: 409, statusMessage: 'Ce moyen de paiement n’est pas accepté.' })
  }

  await confirmQuoteOnSite(quote, method)

  return { ok: true, method }
})
