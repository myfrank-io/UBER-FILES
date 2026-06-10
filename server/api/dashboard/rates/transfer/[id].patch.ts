import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  pricePerKmCents: z.number().int().min(1).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  endMinute: z.number().int().min(1).max(2880).optional(),
  priority: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.transferRateBand.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Bande tarifaire introuvable.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const band = await prisma.transferRateBand.update({ where: { id }, data: body.data })
  return band
})
