import type { Prisma, PaymentProvider } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { bookingSlot } from '~/server/utils/calendar'
import { sendEmail, emailTemplates } from '~/server/utils/email'
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
 * et envoie l'email de confirmation légal au client. Idempotent (no-op si déjà confirmé).
 */
export async function confirmBookingFromQuote(quote: QuoteWithRelations, payment: PaymentInfo): Promise<string | null> {
  if (quote.booking) return quote.booking.id // déjà confirmé
  const req = quote.rideRequest
  if (!req.customerId) return null

  const serviceDurationSeconds =
    req.type === 'TRANSFER'
      ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
      : (req.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, req.scheduledAt, serviceDurationSeconds)

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
      },
    })
    return booking
  })

  const config = useRuntimeConfig()
  const manageToken = await signClientToken({ purpose: 'manage', ref: booking.id }, config.linkTokenSecret, '90d')
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

  return booking.id
}
