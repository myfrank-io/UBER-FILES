import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Tableau de bord admin (Chams) : chauffeurs, volume de courses, facturation.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [drivers, bookingCount, revenue, subscriptions] = await Promise.all([
    prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { bookings: true } },
        subscription: true,
      },
    }),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true, applicationFeeCents: true } }),
    prisma.subscription.aggregate({ where: { status: 'ACTIVE' }, _sum: { monthlyFeeCents: true } }),
  ])

  return {
    stats: {
      driversTotal: drivers.length,
      driversActive: drivers.filter((d) => d.status === 'ACTIVE').length,
      bookingsConfirmed: bookingCount,
      gmvCents: revenue._sum.amountCents ?? 0,
      commissionCents: revenue._sum.applicationFeeCents ?? 0,
      mrrCents: subscriptions._sum.monthlyFeeCents ?? 0,
    },
    drivers: drivers.map((d) => ({
      id: d.id,
      slug: d.slug,
      displayName: d.displayName,
      status: d.status,
      sirenVerified: d.sirenVerified,
      stripeReady: d.stripeChargesEnabled,
      bookings: d._count.bookings,
      monthlyFeeCents: d.subscription?.monthlyFeeCents ?? 0,
      createdAt: d.createdAt,
    })),
  }
})
