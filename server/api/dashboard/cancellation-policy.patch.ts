import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  freeUntilHours: z.number().int().min(0).max(720),
  retainedPercent: z.number().int().min(0).max(100),
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

  await prisma.cancellationPolicy.upsert({
    where: { driverId },
    create: { driverId, ...body.data },
    update: body.data,
  })

  return { ok: true }
})
