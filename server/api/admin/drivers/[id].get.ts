import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      subscription: true,
      user: { select: { id: true, email: true } },
      _count: { select: { bookings: true, customers: true, rideRequests: true } },
    },
  })

  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const [revenue, upcoming] = await Promise.all([
    prisma.payment.aggregate({
      where: { driverId: id, status: 'PAID' },
      _sum: { amountCents: true, applicationFeeCents: true },
      _count: true,
    }),
    prisma.booking.count({
      where: { driverId: id, status: 'CONFIRMED', scheduledAt: { gte: new Date() } },
    }),
  ])

  return {
    id: driver.id,
    slug: driver.slug,
    displayName: driver.displayName,
    status: driver.status,
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    siren: driver.siren,
    sirenVerified: driver.sirenVerified,
    companyName: driver.companyName,
    commissionBps: driver.commissionBps,
    currency: driver.currency,
    telegramLinked: Boolean(driver.telegramChatId),
    telegramLinkCode: driver.telegramLinkCode,
    stripe: {
      connected: Boolean(driver.stripeAccountId),
      chargesEnabled: driver.stripeChargesEnabled,
      payoutsEnabled: driver.stripePayoutsEnabled,
    },
    subscription: driver.subscription,
    user: driver.user,
    stats: {
      bookings: driver._count.bookings,
      customers: driver._count.customers,
      rideRequests: driver._count.rideRequests,
      upcomingBookings: upcoming,
      revenueCents: revenue._sum.amountCents ?? 0,
      commissionCents: revenue._sum.applicationFeeCents ?? 0,
      payments: revenue._count,
    },
    createdAt: driver.createdAt,
  }
})
