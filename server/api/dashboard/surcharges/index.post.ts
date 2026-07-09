import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  name: z.string().min(2).max(80),
  kind: z.enum(['FIXED', 'PERCENT']),
  amount: z.number().int().positive(),
  autoApply: z.boolean().default(false),
  // Fenêtre « dernière minute » en minutes (max 30 jours). null = toujours.
  maxLeadTimeMinutes: z.number().int().min(1).max(43_200).optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Données invalides.' })

  const surcharge = await prisma.surcharge.create({
    data: { driverId, ...body.data },
  })
  return surcharge
})
