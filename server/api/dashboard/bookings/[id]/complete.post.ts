import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const booking = await prisma.booking.findUnique({ where: { id } })

  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }
  if (booking.status !== 'CONFIRMED') {
    throw createError({ statusCode: 422, statusMessage: 'Seules les réservations confirmées peuvent être marquées comme terminées.' })
  }
  if (booking.scheduledAt > new Date()) {
    throw createError({ statusCode: 422, statusMessage: 'Impossible de terminer une course dont la date est dans le futur.' })
  }

  await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED' } })

  return { ok: true }
})
