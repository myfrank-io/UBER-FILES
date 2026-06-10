import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.transferRateBand.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Bande tarifaire introuvable.' })
  }

  const count = await prisma.transferRateBand.count({ where: { driverId } })
  if (count <= 1) {
    throw createError({ statusCode: 422, statusMessage: 'Impossible de supprimer la dernière bande tarifaire.' })
  }

  await prisma.transferRateBand.delete({ where: { id } })
  return { ok: true }
})
