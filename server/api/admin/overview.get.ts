import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Tableau de bord admin (Chams) : chauffeurs, volume de courses, facturation.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [drivers, bookingCount, revenue] = await Promise.all([
    prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { bookings: true } },
      },
    }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true } }),
  ])

  return {
    stats: {
      driversTotal: drivers.length,
      driversActive: drivers.filter((d) => d.status === 'ACTIVE').length,
      bookingsConfirmed: bookingCount,
      // Volume encaissé par les chauffeurs (ils sont merchant of record via SumUp).
      gmvCents: revenue._sum.amountCents ?? 0,
    },
    drivers: drivers.map((d) => ({
      id: d.id,
      slug: d.slug,
      displayName: d.displayName,
      status: d.status,
      // Encaissement en ligne : on n'utilise que SumUp (chauffeur = merchant of record).
      sumupConnected: d.sumupConnected,
      bookings: d._count.bookings,
      createdAt: d.createdAt,
    })),
  }
})
