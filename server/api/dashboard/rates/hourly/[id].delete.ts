import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.hourlyRateTier.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Palier tarifaire introuvable.' })
  }

  const count = await prisma.hourlyRateTier.count({ where: { driverId } })
  if (count <= 1) {
    throw createError({ statusCode: 422, statusMessage: 'Impossible de supprimer le dernier palier tarifaire.' })
  }

  await prisma.hourlyRateTier.delete({ where: { id } })
  return { ok: true }
})
