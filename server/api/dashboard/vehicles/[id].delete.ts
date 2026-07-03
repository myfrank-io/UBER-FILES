import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.vehicle.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Véhicule introuvable.' })
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.delete({ where: { id } })
    // Si on a supprimé le véhicule mis en avant, en promouvoir un autre.
    if (existing.isPrimary) {
      const next = await tx.vehicle.findFirst({
        where: { driverId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      })
      if (next) await tx.vehicle.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
  })

  return { ok: true }
})
