import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { bookingSlot } from '~/server/utils/calendar'

// Événements du calendrier du chauffeur sur une plage donnée.
// Les événements de type BOOKING sont enrichis des détails de la course
// (client, trajet, montant) pour affichage direct dans le calendrier.
// Les devis envoyés en attente de paiement client apparaissent aussi, en
// événements virtuels PENDING_QUOTE (informatifs : ils ne bloquent pas le créneau).
const query = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const now = new Date()
  const q = await getValidatedQuery(event, (v) => query.safeParse(v))
  const from = q.success && q.data.from ? new Date(q.data.from) : new Date()
  const to =
    q.success && q.data.to ? new Date(q.data.to) : new Date(now.getTime() + 30 * 86_400_000)

  // Devis en attente : on n'affiche que les courses encore à venir. Un devis dont
  // la date de course est passée est archivé (voir isQuotePaymentExpired) et ne
  // doit plus apparaître dans le calendrier. On garde une marge de 2 jours en amont
  // de la fenêtre affichée (durée de service + approche), sans jamais remonter
  // avant maintenant.
  const pendingScheduledFrom = new Date(
    Math.max(now.getTime(), from.getTime() - 2 * 86_400_000),
  )

  const [driver, events, sentQuotes] = await Promise.all([
    // Seul champ utilisé ici (bookingSlot) : pas besoin de la ligne complète.
    prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      select: { approachBufferMinutes: true },
    }),
    prisma.calendarEvent.findMany({
      where: { driverId, startAt: { lt: to }, endAt: { gt: from } },
      include: {
        booking: {
          include: {
            customer: true,
            quote: { include: { rideRequest: true } },
            payments: true,
          },
        },
      },
      orderBy: { startAt: 'asc' },
    }),
    // Devis envoyés, non archivés (délai de validité non dépassé ET course encore
    // à venir), dont la course tombe dans la plage affichée.
    prisma.quote.findMany({
      where: {
        driverId,
        status: 'SENT',
        expiresAt: { gte: now },
        rideRequest: {
          scheduledAt: { lt: to, gte: pendingScheduledFrom },
        },
      },
      include: { rideRequest: true },
    }),
  ])

  const calendarEvents = events.map((e) => ({
    id: e.id,
    type: e.type as string,
    source: e.source,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    bookingId: e.bookingId,
    booking: e.booking
      ? {
          id: e.booking.id,
          status: e.booking.status,
          amountCents: e.booking.amountCents,
          scheduledAt: e.booking.scheduledAt,
          customerName: e.booking.customer.name,
          customerPhone: e.booking.customer.phone,
          type: e.booking.quote.rideRequest.type,
          pickupAddress: e.booking.quote.rideRequest.pickupAddress,
          dropoffAddress: e.booking.quote.rideRequest.dropoffAddress,
          roundTrip: e.booking.quote.rideRequest.roundTrip,
          durationHours: e.booking.quote.rideRequest.durationHours,
          notes: e.booking.quote.rideRequest.notes,
          // Réglé (en ligne ou encaissé) ou encore à encaisser sur place le jour J.
          paid: e.booking.payments.some((p) => p.status === 'PAID'),
        }
      : null,
  }))

  // Devis en attente : même emprise que s'ils étaient confirmés (course + approche),
  // affichés distinctement côté interface.
  const pendingEvents = sentQuotes.map((quote) => {
    const req = quote.rideRequest
    const serviceDurationSeconds =
      req.type === 'TRANSFER'
        ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
        : (req.durationHours ?? 0) * 3600
    const slot = bookingSlot(driver, req.scheduledAt, serviceDurationSeconds)
    return {
      id: `quote-${quote.id}`,
      type: 'PENDING_QUOTE',
      source: 'INTERNAL',
      title: `Devis — ${req.customerName}`,
      startAt: slot.startAt,
      endAt: slot.endAt,
      bookingId: null,
      booking: {
        id: quote.id,
        status: 'PENDING_PAYMENT',
        amountCents: quote.amountCents,
        scheduledAt: req.scheduledAt,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        type: req.type,
        pickupAddress: req.pickupAddress,
        dropoffAddress: req.dropoffAddress,
        roundTrip: req.roundTrip,
        durationHours: req.durationHours,
        notes: req.notes,
        paid: false,
      },
    }
  })

  return [...calendarEvents, ...pendingEvents].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )
})
