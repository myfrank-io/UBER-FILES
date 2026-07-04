import type { Prisma, PaymentProvider } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { notifyDriver } from '~/server/utils/notify-driver'
import { bookingConfirmedMessage, driverFirstName } from '~/server/utils/telegram'
import { signClientToken } from '~/server/utils/tokens'

type QuoteWithRelations = Prisma.QuoteGetPayload<{
  include: { driver: true; rideRequest: true; booking: true }
}>

interface PaymentInfo {
  provider: PaymentProvider
  amountCents: number
  applicationFeeCents: number
  currency: string
  stripeCheckoutSessionId?: string
  stripePaymentIntentId?: string
  sumupCheckoutId?: string
  sumupTransactionCode?: string
}

/**
 * Confirme une course à partir d'un devis payé, indépendamment du prestataire de
 * paiement : crée Booking + CalendarEvent + Payment, passe le devis en ACCEPTED,
 * et envoie les emails de confirmation. Idempotent : si la course est déjà
 * confirmée, l'appel enregistre au besoin le paiement retardataire (session de
 * paiement restée ouverte après une confirmation « sur place ») puis s'arrête.
 */
export async function confirmBookingFromQuote(quote: QuoteWithRelations, payment: PaymentInfo): Promise<string | null> {
  if (quote.booking) {
    // Course déjà confirmée (retry de webhook, ou paiement aboutissant après une
    // confirmation avec règlement sur place) : l'argent encaissé doit rester
    // visible et l'encaissement sur place ne doit plus être réclamé.
    await recordLatePayment(quote.booking.id, quote, payment)
    return quote.booking.id
  }
  const req = quote.rideRequest
  if (!req.customerId) return null

  const serviceDurationSeconds =
    req.type === 'TRANSFER'
      ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
      : (req.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, req.scheduledAt, serviceDurationSeconds)

  // Le paiement est déjà encaissé : un conflit détecté ici n'empêche pas la
  // confirmation, mais le chauffeur est alerté du chevauchement dans son email.
  const conflict = await findConflict(quote.driverId, slot)

  const booking = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        driverId: quote.driverId,
        quoteId: quote.id,
        customerId: req.customerId!,
        status: 'CONFIRMED',
        scheduledAt: req.scheduledAt,
        amountCents: quote.amountCents,
        calendarEvent: {
          create: {
            driverId: quote.driverId,
            type: 'BOOKING',
            source: 'INTERNAL',
            title: `Course — ${req.customerName}`,
            startAt: slot.startAt,
            endAt: slot.endAt,
          },
        },
      },
    })
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } })
    await tx.payment.create({
      data: {
        driverId: quote.driverId,
        bookingId: booking.id,
        provider: payment.provider,
        stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        sumupCheckoutId: payment.sumupCheckoutId,
        sumupTransactionCode: payment.sumupTransactionCode,
        amountCents: payment.amountCents,
        applicationFeeCents: payment.applicationFeeCents,
        currency: payment.currency,
        status: 'PAID',
        method: 'STRIPE_PREPAYMENT', // prépaiement en ligne, quel que soit le prestataire
      },
    })
    return booking
  })

  // La course est confirmée et payée : un échec d'email ne doit pas faire échouer
  // le webhook (le retry serait un no-op et les emails ne partiraient jamais).
  const config = useRuntimeConfig()
  try {
    const manageToken = await signClientToken({ purpose: 'manage', ref: booking.id }, config.linkTokenSecret as string, '90d')
    await sendEmail({
      to: req.customerEmail,
      ...emailTemplates.paymentConfirmed({
        driverName: quote.driver.displayName,
        amountCents: quote.amountCents,
        currency: quote.currency,
        scheduledAt: req.scheduledAt,
        manageUrl: `${config.public.appBaseUrl}/reservation/${manageToken}`,
        driverPhone: quote.driver.phone,
        driverEmail: quote.driver.contactEmail,
        siren: quote.driver.siren,
        companyName: quote.driver.companyName,
        vehicleMake: quote.driver.vehicleMake,
        vehicleModel: quote.driver.vehicleModel,
      }),
    })
  } catch (err) {
    console.error('[booking-confirm] échec email client', err)
  }

  // Le chauffeur est prévenu par email qu'une course payée vient d'être confirmée.
  try {
    await notifyDriver(quote.driver, {
      email: emailTemplates.bookingConfirmedDriver({
        driverFirstName: driverFirstName(quote.driver.displayName),
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        customerEmail: req.customerEmail,
        scheduledAt: req.scheduledAt,
        amountCents: quote.amountCents,
        currency: quote.currency,
        paidOnline: true,
        conflictWarning: Boolean(conflict),
        dashboardUrl: `${config.public.appBaseUrl}/dashboard/reservations`,
      }),
      telegram: bookingConfirmedMessage({
        driverDisplayName: quote.driver.displayName,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        scheduledAt: req.scheduledAt,
        type: req.type,
        durationHours: req.durationHours,
        pickupAddress: req.pickupAddress,
        dropoffAddress: req.dropoffAddress,
        amountCents: quote.amountCents,
        currency: quote.currency,
        paidOnline: true,
        conflictWarning: Boolean(conflict),
      }),
    })
  } catch (err) {
    console.error('[booking-confirm] échec email chauffeur', err)
  }

  return booking.id
}

/**
 * Paiement en ligne aboutissant sur une course DÉJÀ confirmée : enregistre le
 * règlement (idempotent par identifiant de session/checkout) et clôt les
 * encaissements sur place en attente, pour ne pas réclamer deux fois le client.
 */
async function recordLatePayment(
  bookingId: string,
  quote: QuoteWithRelations,
  payment: PaymentInfo,
): Promise<void> {
  const sessionFilters: Prisma.PaymentWhereInput[] = []
  if (payment.stripeCheckoutSessionId) {
    sessionFilters.push({ stripeCheckoutSessionId: payment.stripeCheckoutSessionId })
  }
  if (payment.sumupCheckoutId) {
    sessionFilters.push({ sumupCheckoutId: payment.sumupCheckoutId })
  }
  if (sessionFilters.length === 0) return

  // Idempotence : le retry d'un webhook réutilise le même identifiant de session.
  const already = await prisma.payment.findFirst({ where: { OR: sessionFilters } })
  if (already) return

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        driverId: quote.driverId,
        bookingId,
        provider: payment.provider,
        stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        sumupCheckoutId: payment.sumupCheckoutId,
        sumupTransactionCode: payment.sumupTransactionCode,
        amountCents: payment.amountCents,
        applicationFeeCents: payment.applicationFeeCents,
        currency: payment.currency,
        status: 'PAID',
        method: 'STRIPE_PREPAYMENT',
      },
    }),
    // L'encaissement sur place prévu n'a plus lieu d'être : la course est payée.
    prisma.payment.updateMany({
      where: { bookingId, status: 'PENDING' },
      data: { status: 'FAILED' },
    }),
  ])
  console.info(`[booking-confirm] paiement en ligne retardataire enregistré (booking ${bookingId})`)
}
