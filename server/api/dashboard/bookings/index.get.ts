import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const query = getQuery(event)

  const status = query.status as string | undefined
  const from = query.from ? new Date(query.from as string) : undefined
  const to = query.to ? new Date(query.to as string) : undefined
  const page = Math.max(1, parseInt((query.page as string) ?? '1'))
  const perPage = 20

  const where = {
    driverId,
    ...(status ? { status: status as 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' } : {}),
    ...(from || to
      ? {
          scheduledAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        customer: true,
        quote: { include: { rideRequest: true } },
        payments: { where: { status: 'PAID' }, take: 1 },
      },
      orderBy: { scheduledAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.booking.count({ where }),
  ])

  return {
    bookings: bookings.map((b) => ({
      id: b.id,
      status: b.status,
      scheduledAt: b.scheduledAt,
      amountCents: b.amountCents,
      currency: b.quote.currency,
      customer: { name: b.customer.name, phone: b.customer.phone, email: b.customer.email },
      ride: {
        type: b.quote.rideRequest.type,
        pickupAddress: b.quote.rideRequest.pickupAddress,
        dropoffAddress: b.quote.rideRequest.dropoffAddress,
        roundTrip: b.quote.rideRequest.roundTrip,
        durationHours: b.quote.rideRequest.durationHours,
        distanceMeters: b.quote.rideRequest.distanceMeters,
        notes: b.quote.rideRequest.notes,
      },
      paidAt: b.payments[0]?.createdAt ?? null,
    })),
    total,
    page,
    pages: Math.ceil(total / perPage),
  }
})
