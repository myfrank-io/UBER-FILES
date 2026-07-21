import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { tierCreateData, tiersSchema } from '~/server/utils/rate-tiers'

const schema = z
  .object({
    name: z.string().min(1).max(80),
    pricePerKmCents: z.number().int().min(1).optional(),
    tiers: tiersSchema.default([]),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(2880),
    priority: z.number().int().min(0).default(0),
    isDefault: z.boolean().default(false),
  })
  .refine((b) => b.tiers.length > 0 || b.pricePerKmCents != null, {
    message: 'Prix au km ou grille dégressive requis.',
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

  const { tiers, pricePerKmCents, ...data } = body.data
  const band = await prisma.transferRateBand.create({
    data: {
      driverId,
      ...data,
      // Avec une grille, le prix affiché de la bande suit le premier palier
      // (prix d'appel : tri « à partir de », page publique).
      pricePerKmCents: tiers.length ? tiers[0].pricePerKmCents : pricePerKmCents!,
      tiers: { create: tierCreateData(tiers) },
    },
    include: { tiers: { orderBy: { position: 'asc' } } },
  })

  return band
})
