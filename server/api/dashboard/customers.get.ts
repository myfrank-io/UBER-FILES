import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Base clients du chauffeur (« portefeuille clientèle privée ») avec historique.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const customers = await prisma.customer.findMany({
    where: { driverId },
    include: {
      bookings: {
        where: { status: { in: ['CONFIRMED', 'COMPLETED'] } },
        select: { id: true, scheduledAt: true, amountCents: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    ridesCount: c.bookings.length,
    totalSpentCents: c.bookings.reduce((s, b) => s + b.amountCents, 0),
    lastRideAt: c.bookings.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())[0]?.scheduledAt ?? null,
  }))
})
