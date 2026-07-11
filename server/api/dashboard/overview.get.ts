import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { driverBookingMode } from '~/server/utils/driver'
import { resolveRequestPayment, type BookingMode } from '~/lib/booking-policy'
import { PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'

// Règlement attendu d'une demande, prêt à afficher en un coup d'œil sur la carte.
function requestPayment(mode: BookingMode, preferred: PaymentMethod | null) {
  const resolved = resolveRequestPayment(mode, preferred)
  if (resolved.kind === 'ONLINE') return { kind: 'ONLINE' as const, label: 'En ligne (carte)' }
  if (resolved.kind === 'ONSITE') {
    return {
      kind: 'ONSITE' as const,
      method: resolved.method,
      label: `Sur place — ${PAYMENT_METHOD_SHORT_LABELS[resolved.method]}`,
    }
  }
  return { kind: 'UNDECIDED' as const, label: 'À définir avec le client' }
}

// Accueil chauffeur : devis en attente, courses à venir.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const now = new Date()

  const [driver, pendingQuotes, sentQuotes, upcomingBookings] = await Promise.all([
    // Seuls les champs nécessaires au mode de réservation : évite de rapatrier
    // la ligne complète (bio, textes…) à chaque affichage du tableau de bord.
    prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      select: {
        paymentMethods: true,
        autoAcceptQuotes: true,
        paymentProvider: true,
        sumupConnected: true,
        stripeChargesEnabled: true,
      },
    }),
    prisma.quote.findMany({
      where: { driverId, status: 'DRAFT' },
      include: { rideRequest: true },
      orderBy: { createdAt: 'desc' },
    }),
    // Devis validés, envoyés au client, en attente de son paiement/confirmation.
    // Toujours actifs : délai de validité non dépassé ET course encore à venir.
    prisma.quote.findMany({
      where: {
        driverId,
        status: 'SENT',
        expiresAt: { gte: now },
        rideRequest: { scheduledAt: { gte: now } },
      },
      include: { rideRequest: true },
      orderBy: { expiresAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: { driverId, status: 'CONFIRMED', scheduledAt: { gte: now } },
      include: {
        customer: true,
        quote: { include: { rideRequest: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    }),
  ])

  const mode = driverBookingMode(driver)

  return {
    pendingQuotes: pendingQuotes.map((q) => {
      // Règlement attendu + action du bouton : accepter = confirmer directement
      // (sur place) ou envoyer le devis avec lien de paiement (en ligne).
      const payment = requestPayment(
        mode,
        q.rideRequest.preferredPaymentMethod as PaymentMethod | null,
      )
      return {
        id: q.id,
        amountCents: q.amountCents,
        currency: q.currency,
        breakdown: q.breakdown,
        createdAt: q.createdAt,
        payment,
        directAccept: payment.kind === 'ONSITE',
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
      }
    }),
    sentQuotes: sentQuotes.map((q) => ({
      id: q.id,
      amountCents: q.amountCents,
      currency: q.currency,
      sentAt: q.sentAt,
      expiresAt: q.expiresAt,
      // Ce que l'on attend du client : paiement en ligne, ou acceptation du
      // devis (règlement sur place).
      payment: requestPayment(mode, q.rideRequest.preferredPaymentMethod as PaymentMethod | null),
      ride: {
        type: q.rideRequest.type,
        customerName: q.rideRequest.customerName,
        customerPhone: q.rideRequest.customerPhone,
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
      // Comment la course est (ou sera) réglée — affiché en un coup d'œil.
      payment: b.payments[0]
        ? { method: b.payments[0].method, status: b.payments[0].status }
        : null,
    })),
  }
})
