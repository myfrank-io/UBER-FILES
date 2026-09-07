import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { setupLinkUrl, setupProgress } from '~/server/utils/setup'
import { setupLinkStatus } from '~/lib/setup-flow'
import { INVOICE_INCLUDE, serializeInvoice } from '~/server/utils/invoice'
import { cashPosition } from '~/lib/invoice'

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

  const [revenue, upcoming, progress, invoices] = await Promise.all([
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
    // Ce que Ridewiz a facturé À ce chauffeur (accès, paramétrage, cartes) —
    // à ne pas confondre avec `revenue`, qui est ce que LUI encaisse de ses
    // clients.
    prisma.invoice.findMany({
      where: { driverId: id },
      include: INVOICE_INCLUDE,
      orderBy: { issuedAt: 'desc' },
      take: 50,
    }),
  ])

  return {
    // Facturation Ridewiz → chauffeur : le détail des factures et la position
    // de trésorerie qui en découle (encaissé / reste à recevoir).
    billing: {
      invoices: invoices.map(serializeInvoice),
      ...cashPosition(invoices),
    },
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
