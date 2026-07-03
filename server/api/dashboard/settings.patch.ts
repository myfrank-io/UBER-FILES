import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { PAYMENT_METHODS } from '~/lib/payment-methods'

const schema = z.object({
  minimumFareCents: z.number().int().min(0).optional(),
  minLeadTimeMinutes: z.number().int().min(0).optional(),
  quoteExpiryHours: z.number().int().min(1).max(168).optional(),
  approachBufferMinutes: z.number().int().min(0).max(180).optional(),
  paymentMethods: z
    .array(z.enum(PAYMENT_METHODS as [string, ...string[]]))
    .min(1, 'Sélectionnez au moins un moyen de paiement.')
    .optional(),
  autoAcceptQuotes: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  // Dédoublonne les moyens de paiement (l'UI envoie un tableau de cases cochées).
  const data = body.data.paymentMethods
    ? { ...body.data, paymentMethods: [...new Set(body.data.paymentMethods)] }
    : body.data

  await prisma.driver.update({ where: { id: driverId }, data })

  return { ok: true }
})
