import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Événements du calendrier du chauffeur sur une plage donnée (courses + indisponibilités).
const query = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const q = await getValidatedQuery(event, (v) => query.safeParse(v))
  const from = q.success && q.data.from ? new Date(q.data.from) : new Date()
  const to =
    q.success && q.data.to ? new Date(q.data.to) : new Date(Date.now() + 30 * 86_400_000)

  const events = await prisma.calendarEvent.findMany({
    where: { driverId, startAt: { lt: to }, endAt: { gt: from } },
    orderBy: { startAt: 'asc' },
  })
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    source: e.source,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    bookingId: e.bookingId,
  }))
})
