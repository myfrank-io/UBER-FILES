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

// Accueil chauffeur : devis en attente, courses à venir, chiffres du mois.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const now = new Date()

  // Chiffres « ce mois-ci » : plus parlants pour un accueil que des cumuls
  // depuis toujours (l'historique détaillé reste consultable dans Courses).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [driver, pendingQuotes, sentQuotes, expiredQuotes, upcomingBookings, monthRides, monthPaid] = await Promise.all([
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
    // Demandes à valider : uniquement des courses encore à venir — une demande
    // dont la date est passée n'est plus actionnable (archivée ci-dessous).
    prisma.quote.findMany({
      where: { driverId, status: 'DRAFT', rideRequest: { scheduledAt: { gte: now } } },
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
    // Archivés automatiquement :
    //  - SENT : délai de validité dépassé OU course passée (client n'a pas réglé
    //    à temps) ;
    //  - DRAFT : le chauffeur n'a pas validé avant la date de la course.
    prisma.quote.findMany({
      where: {
        driverId,
        OR: [
          {
            status: 'SENT',
            OR: [{ expiresAt: { lt: now } }, { rideRequest: { scheduledAt: { lt: now } } }],
          },
          { status: 'DRAFT', rideRequest: { scheduledAt: { lt: now } } },
        ],
      },
      include: { rideRequest: true },
      orderBy: { expiresAt: 'desc' },
      take: 10,
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
    // Courses du mois (planifiées ce mois-ci, confirmées ou terminées).
    prisma.booking.count({
      where: {
        driverId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        scheduledAt: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    // Encaissé du mois (paiements réglés ce mois-ci, en ligne ou sur place).
    prisma.payment.aggregate({
      where: { driverId, status: 'PAID', createdAt: { gte: monthStart, lt: nextMonthStart } },
      _sum: { amountCents: true },
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
      // Comment la course est (ou sera) réglée — affiché en un coup d'œil.
      payment: b.payments[0]
        ? { method: b.payments[0].method, status: b.payments[0].status }
        : null,
    })),
    stats: {
      monthRides,
      monthRevenueCents: monthPaid._sum.amountCents ?? 0,
    },
  }
})
