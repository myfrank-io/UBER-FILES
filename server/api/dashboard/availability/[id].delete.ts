import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Suppression d'une indisponibilité (jamais une course confirmée).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  const ev = await prisma.calendarEvent.findFirst({ where: { id, driverId } })
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Événement introuvable.' })
  if (ev.type !== 'UNAVAILABILITY') {
    throw createError({ statusCode: 403, statusMessage: 'Seules les indisponibilités sont supprimables.' })
  }
  await prisma.calendarEvent.delete({ where: { id } })
  return { ok: true }
})
