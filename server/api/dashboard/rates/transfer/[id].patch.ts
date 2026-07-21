import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { tierCreateData, tiersSchema } from '~/server/utils/rate-tiers'

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  pricePerKmCents: z.number().int().min(1).optional(),
  // Absent = paliers inchangés ; [] = retour au prix unique ; sinon la grille
  // envoyée remplace intégralement l'existante.
  tiers: tiersSchema.optional(),
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

  const { tiers, ...data } = body.data
  const band = await prisma.transferRateBand.update({
    where: { id },
    data: {
      ...data,
      ...(tiers
        ? {
            // Le prix affiché de la bande suit le premier palier de la grille.
            ...(tiers.length ? { pricePerKmCents: tiers[0].pricePerKmCents } : {}),
            tiers: { deleteMany: {}, create: tierCreateData(tiers) },
          }
        : {}),
    },
    include: { tiers: { orderBy: { position: 'asc' } } },
  })
  return band
})
