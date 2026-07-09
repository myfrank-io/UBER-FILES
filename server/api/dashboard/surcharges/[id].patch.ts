import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  kind: z.enum(['FIXED', 'PERCENT']).optional(),
  amount: z.number().int().positive().optional(),
  autoApply: z.boolean().optional(),
  // Fenêtre « dernière minute » en minutes (max 30 jours). null = toujours.
  maxLeadTimeMinutes: z.number().int().min(1).max(43_200).optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Données invalides.' })

  const existing = await prisma.surcharge.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Supplément introuvable.' })
  }

  return prisma.surcharge.update({ where: { id }, data: body.data })
})
