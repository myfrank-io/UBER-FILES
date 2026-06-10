import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  minimumFareCents: z.number().int().min(0).optional(),
  minLeadTimeMinutes: z.number().int().min(0).optional(),
  quoteExpiryHours: z.number().int().min(1).max(168).optional(),
  approachBufferMinutes: z.number().int().min(0).max(180).optional(),
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

  await prisma.driver.update({ where: { id: driverId }, data: body.data })

  return { ok: true }
})
