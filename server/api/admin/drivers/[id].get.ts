import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { setupLinkUrl, setupProgress } from '~/server/utils/setup'
import { setupLinkStatus } from '~/lib/setup-flow'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, emailVerified: true } },
      _count: { select: { bookings: true, customers: true, rideRequests: true } },
    },
  })

  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const [revenue, upcoming, progress] = await Promise.all([
    prisma.payment.aggregate({
      where: { driverId: id, status: 'PAID' },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.booking.count({
      where: { driverId: id, status: 'CONFIRMED', scheduledAt: { gte: new Date() } },
    }),
    // Avancement du parcours (même calcul que l'écran du chauffeur), même sans
    // lien : un chauffeur existant a déjà une partie de sa configuration faite.
    driver.user ? setupProgress(id) : Promise.resolve(null),
  ])

  return {
    id: driver.id,
    slug: driver.slug,
    displayName: driver.displayName,
    status: driver.status,
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    companyName: driver.companyName,
    currency: driver.currency,
    telegramLinked: Boolean(driver.telegramChatId),
    telegramLinkCode: driver.telegramLinkCode,
    // Encaissement en ligne : uniquement SumUp (le chauffeur encaisse en direct).
    sumup: {
      connected: driver.sumupConnected,
      merchantCode: driver.sumupMerchantCode,
    },
    user: driver.user,
    // Parcours de configuration guidée : lien courant (s'il est encore valide)
    // et avancement, pour que l'admin sache s'il faut relancer le chauffeur.
    setup: {
      status: setupLinkStatus(driver),
      url:
        driver.setupToken && driver.setupTokenExpiresAt && driver.setupTokenExpiresAt > new Date()
          ? setupLinkUrl(driver.setupToken)
          : null,
      expiresAt: driver.setupTokenExpiresAt,
      startedAt: driver.setupStartedAt,
      completedAt: driver.setupCompletedAt,
      progress,
    },
    stats: {
      bookings: driver._count.bookings,
      customers: driver._count.customers,
      rideRequests: driver._count.rideRequests,
      upcomingBookings: upcoming,
      revenueCents: revenue._sum.amountCents ?? 0,
      payments: revenue._count,
    },
    createdAt: driver.createdAt,
  }
})
