import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { signClientToken } from '~/server/utils/tokens'
import { sendEmail, emailTemplates } from '~/server/utils/email'

const schema = z.object({
  amountCents: z.number().int().positive().optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Montant invalide.' })

  const quote = await prisma.quote.findFirst({
    where: { id, driverId },
    include: { driver: true, rideRequest: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })

  const isExpired = quote.status === 'SENT' && quote.expiresAt.getTime() < Date.now()
  if (!isExpired) {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis n\'est pas expiré.' })
  }

  const amountCents = body.data.amountCents ?? quote.amountCents
  const expiresAt = new Date(Date.now() + quote.driver.quoteExpiryHours * 3_600_000)

  await prisma.quote.update({
    where: { id },
    data: { amountCents, sentAt: new Date(), expiresAt },
  })

  const config = useRuntimeConfig()
  // Jeton plus long que l'expiration business : le lien reste consultable après
  // expiration (la page affiche alors « devis expiré » au lieu d'un lien mort).
  const token = await signClientToken(
    { purpose: 'quote', ref: id },
    config.linkTokenSecret,
    '30d',
  )
  const payUrl = `${config.public.appBaseUrl}/devis/${token}`

  await sendEmail({
    to: quote.rideRequest.customerEmail,
    ...emailTemplates.quoteSent({
      driverName: quote.driver.displayName,
      amountCents,
      currency: quote.currency,
      payUrl,
      expiresAt,
      type: quote.rideRequest.type,
      scheduledAt: quote.rideRequest.scheduledAt,
      pickupAddress: quote.rideRequest.pickupAddress,
      dropoffAddress: quote.rideRequest.dropoffAddress,
      roundTrip: quote.rideRequest.roundTrip,
      durationHours: quote.rideRequest.durationHours,
      originalAmountCents: quote.computedAmountCents,
    }),
  })

  return { ok: true, payUrl }
})
