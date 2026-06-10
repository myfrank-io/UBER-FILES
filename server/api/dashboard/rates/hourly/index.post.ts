import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  minHours: z.number().int().min(1).max(24),
  pricePerHourCents: z.number().int().min(1),
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

  const existing = await prisma.hourlyRateTier.findUnique({
    where: { driverId_minHours: { driverId, minHours: body.data.minHours } },
  })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Un palier existe déjà pour cette durée.' })
  }

  const tier = await prisma.hourlyRateTier.create({ data: { driverId, ...body.data } })
  return tier
})
