import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  name: z.string().min(1).max(80),
  pricePerKmCents: z.number().int().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(2880),
  priority: z.number().int().min(0).default(0),
  isDefault: z.boolean().default(false),
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

  const band = await prisma.transferRateBand.create({
    data: { driverId, ...body.data },
  })

  return band
})
