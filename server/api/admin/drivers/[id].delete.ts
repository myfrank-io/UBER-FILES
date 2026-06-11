import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const driver = await prisma.driver.findUnique({ where: { id } })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const upcomingBookings = await prisma.booking.count({
    where: { driverId: id, status: 'CONFIRMED', scheduledAt: { gte: new Date() } },
  })
  if (upcomingBookings > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Impossible d'archiver : ${upcomingBookings} réservation(s) confirmée(s) à venir.`,
    })
  }

  await prisma.driver.update({ where: { id }, data: { status: 'SUSPENDED' } })
  return { ok: true }
})
