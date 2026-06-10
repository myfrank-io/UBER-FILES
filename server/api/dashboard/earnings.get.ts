import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const query = getQuery(event)

  const period = (query.period as string) ?? 'month'
  const now = new Date()

  // Fenêtres temporelles selon la période demandée
  function getRange(p: string): { from: Date; to: Date; label: string }[] {
    const ranges: { from: Date; to: Date; label: string }[] = []
    if (p === 'week') {
      for (let i = 11; i >= 0; i--) {
        const from = new Date(now)
        from.setDate(now.getDate() - i * 7)
        from.setHours(0, 0, 0, 0)
        const to = new Date(from)
        to.setDate(from.getDate() + 6)
        to.setHours(23, 59, 59, 999)
        ranges.push({ from, to, label: `S${getWeekNumber(from)}` })
      }
    } else if (p === 'year') {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i
        ranges.push({
          from: new Date(year, 0, 1),
          to: new Date(year, 11, 31, 23, 59, 59, 999),
          label: String(year),
        })
      }
    } else {
      // month (12 derniers mois)
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const from = new Date(d.getFullYear(), d.getMonth(), 1)
        const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
        ranges.push({
          from,
          to,
          label: d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' }),
        })
      }
    }
    return ranges
  }

  const ranges = getRange(period)

  // Agrégation par période
  const breakdown = await Promise.all(
    ranges.map(async ({ from, to, label }) => {
      const [agg, count] = await Promise.all([
        prisma.payment.aggregate({
          where: { driverId, status: 'PAID', createdAt: { gte: from, lte: to } },
          _sum: { amountCents: true, applicationFeeCents: true },
          _count: true,
        }),
        prisma.booking.count({
          where: { driverId, status: { in: ['CONFIRMED', 'COMPLETED'] }, scheduledAt: { gte: from, lte: to } },
        }),
      ])
      return {
        label,
        from,
        to,
        grossCents: agg._sum.amountCents ?? 0,
        feeCents: agg._sum.applicationFeeCents ?? 0,
        netCents: (agg._sum.amountCents ?? 0) - (agg._sum.applicationFeeCents ?? 0),
        payments: agg._count,
        bookings: count,
      }
    }),
  )

  // Stats globales
  const [allTime, pending] = await Promise.all([
    prisma.payment.aggregate({
      where: { driverId, status: 'PAID' },
      _sum: { amountCents: true, applicationFeeCents: true },
      _count: true,
    }),
    prisma.booking.count({ where: { driverId, status: 'CONFIRMED', scheduledAt: { gte: now } } }),
  ])

  return {
    period,
    breakdown,
    totals: {
      grossCents: allTime._sum.amountCents ?? 0,
      feeCents: allTime._sum.applicationFeeCents ?? 0,
      netCents: (allTime._sum.amountCents ?? 0) - (allTime._sum.applicationFeeCents ?? 0),
      payments: allTime._count,
      upcomingBookings: pending,
    },
  }
})

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
