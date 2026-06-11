import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Tableau de bord chauffeur : devis en attente, courses à venir, statistiques.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const now = new Date()

  const [pendingQuotes, expiredQuotes, upcomingBookings, stats, paidSum] = await Promise.all([
    prisma.quote.findMany({
      where: { driverId, status: 'DRAFT' },
      include: { rideRequest: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quote.findMany({
      where: { driverId, status: 'SENT', expiresAt: { lt: now } },
      include: { rideRequest: true },
      orderBy: { expiresAt: 'desc' },
      take: 10,
    }),
    prisma.booking.findMany({
      where: { driverId, status: 'CONFIRMED', scheduledAt: { gte: now } },
      include: { customer: true, quote: { include: { rideRequest: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    }),
    prisma.booking.groupBy({
      by: ['status'],
      where: { driverId },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { driverId, status: 'PAID' },
      _sum: { amountCents: true },
    }),
  ])

  return {
    pendingQuotes: pendingQuotes.map((q) => ({
      id: q.id,
      amountCents: q.amountCents,
      currency: q.currency,
      breakdown: q.breakdown,
      createdAt: q.createdAt,
      ride: {
        type: q.rideRequest.type,
        customerName: q.rideRequest.customerName,
        customerPhone: q.rideRequest.customerPhone,
        scheduledAt: q.rideRequest.scheduledAt,
        pickupAddress: q.rideRequest.pickupAddress,
        dropoffAddress: q.rideRequest.dropoffAddress,
        roundTrip: q.rideRequest.roundTrip,
        durationHours: q.rideRequest.durationHours,
        notes: q.rideRequest.notes,
      },
    })),
    expiredQuotes: expiredQuotes.map((q) => ({
      id: q.id,
      amountCents: q.amountCents,
      currency: q.currency,
      expiresAt: q.expiresAt,
      ride: {
        type: q.rideRequest.type,
        customerName: q.rideRequest.customerName,
        customerEmail: q.rideRequest.customerEmail,
        scheduledAt: q.rideRequest.scheduledAt,
        pickupAddress: q.rideRequest.pickupAddress,
        dropoffAddress: q.rideRequest.dropoffAddress,
        roundTrip: q.rideRequest.roundTrip,
        durationHours: q.rideRequest.durationHours,
      },
    })),
    upcomingBookings: upcomingBookings.map((b) => ({
      id: b.id,
      scheduledAt: b.scheduledAt,
      amountCents: b.amountCents,
      currency: b.quote.currency,
      customerName: b.customer.name,
      customerPhone: b.customer.phone,
      type: b.quote.rideRequest.type,
      pickupAddress: b.quote.rideRequest.pickupAddress,
      dropoffAddress: b.quote.rideRequest.dropoffAddress,
      durationHours: b.quote.rideRequest.durationHours,
    })),
    stats: {
      confirmed: stats.find((s) => s.status === 'CONFIRMED')?._count ?? 0,
      cancelled: stats.find((s) => s.status === 'CANCELLED')?._count ?? 0,
      totalRevenueCents: paidSum._sum.amountCents ?? 0,
    },
  }
})
