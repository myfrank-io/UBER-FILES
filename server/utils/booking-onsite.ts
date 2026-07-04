import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { bookingSlot, findConflict } from './calendar'
import { sendEmail, emailTemplates } from './email'
import { notifyDriver } from './notify-driver'
import { bookingConfirmedMessage, driverFirstName } from './telegram'
import { signClientToken } from './tokens'
import { isQuotePaymentExpired } from './quote-status'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '~/lib/payment-methods'

type QuoteForConfirm = Prisma.QuoteGetPayload<{
  include: { driver: true; rideRequest: true; booking: true }
}>

export interface OnSiteConfirmOptions {
  /** True quand la confirmation vient d'une action du chauffeur (flux à validation). */
  acceptedByDriver?: boolean
  /** True quand la réservation est confirmée automatiquement dès la demande. */
  autoConfirmed?: boolean
}

export interface OnSiteConfirmResult {
  bookingId: string
  manageUrl: string
}

/**
 * Confirme une course réglée SUR PLACE à partir d'un devis (DRAFT ou SENT) :
 * Booking CONFIRMED + créneau calendrier + Payment PENDING (encaissé le jour J),
 * devis ACCEPTED, puis emails de confirmation au client et au chauffeur.
 * Vérifie l'absence de conflit calendrier juste avant la transaction.
 *
 * Chemin partagé par les trois entrées du règlement sur place :
 *  - confirmation automatique à la demande (flux 3),
 *  - acceptation manuelle par le chauffeur (flux 4),
 *  - confirmation par le client depuis la page devis.
 */
export async function confirmQuoteOnSite(
  quote: QuoteForConfirm,
  method: PaymentMethod,
  opts: OnSiteConfirmOptions = {},
): Promise<OnSiteConfirmResult> {
  const config = useRuntimeConfig()

  if (quote.booking || quote.status === 'ACCEPTED') {
    throw createError({ statusCode: 409, statusMessage: 'Course déjà confirmée.' })
  }
  if (quote.status !== 'DRAFT' && quote.status !== 'SENT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis ne peut pas être confirmé.' })
  }
  // L'expiration ne concerne que le lien client (devis SENT) : le chauffeur reste
  // libre d'accepter une demande DRAFT ancienne — le conflit calendrier est
  // re-vérifié juste en dessous de toute façon. Un devis SENT est expiré si son
  // délai est dépassé OU si la date de la course est déjà passée.
  if (isQuotePaymentExpired(quote)) {
    throw createError({ statusCode: 410, statusMessage: 'Ce devis a expiré.' })
  }

  const req = quote.rideRequest
  if (!req.customerId) {
    throw createError({ statusCode: 422, statusMessage: 'Client manquant.' })
  }

  // Re-vérifier l'absence de conflit calendrier au moment de la confirmation.
  const serviceDurationSeconds =
    req.type === 'TRANSFER'
      ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
      : (req.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, req.scheduledAt, serviceDurationSeconds)
  const conflict = await findConflict(quote.driverId, slot)
  if (conflict) {
    throw createError({
      statusCode: 409,
      // Message orienté chauffeur (il voit son agenda) ou client selon l'appelant.
      statusMessage: opts.acceptedByDriver
        ? `Conflit calendrier avec « ${conflict.title ?? 'événement'} ».`
        : 'Ce créneau n’est plus disponible. Merci de contacter le chauffeur.',
    })
  }

  const booking = await prisma.$transaction(async (tx) => {
    // Transition conditionnelle : si le devis a été traité entre-temps (refusé
    // dans un autre onglet, confirmé par le client…), on n'écrase rien.
    const transitioned = await tx.quote.updateMany({
      where: { id: quote.id, status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    })
    if (transitioned.count === 0) {
      throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
    }
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
    // Paiement en attente : il sera encaissé sur place le jour de la course.
    await tx.payment.create({
      data: {
        driverId: quote.driverId,
        bookingId: booking.id,
        amountCents: quote.amountCents,
        applicationFeeCents: 0,
        currency: quote.currency,
        status: 'PENDING',
        method,
      },
    })
    return booking
  })

  const manageToken = await signClientToken(
    { purpose: 'manage', ref: booking.id },
    config.linkTokenSecret as string,
    '90d',
  )
  const manageUrl = `${config.public.appBaseUrl}/reservation/${manageToken}`

  // La course est confirmée : un échec d'email ne doit pas faire échouer l'appel
  // (le client et le chauffeur retrouvent l'information dans leurs espaces).
  try {
    await sendEmail({
      to: req.customerEmail,
      ...emailTemplates.bookingConfirmedOnSite({
        driverName: quote.driver.displayName,
        amountCents: quote.amountCents,
        currency: quote.currency,
        scheduledAt: req.scheduledAt,
        method,
        manageUrl,
        driverPhone: quote.driver.phone,
        driverEmail: quote.driver.contactEmail,
        siren: quote.driver.siren,
        companyName: quote.driver.companyName,
        vehicleMake: quote.driver.vehicleMake,
        vehicleModel: quote.driver.vehicleModel,
        acceptedByDriver: opts.acceptedByDriver,
      }),
    })
  } catch (err) {
    console.error('[booking-onsite] échec email client', err)
  }

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
        paidOnline: false,
        method,
        autoConfirmed: opts.autoConfirmed,
        acceptedByDriver: opts.acceptedByDriver,
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
        paidOnline: false,
        methodLabel: PAYMENT_METHOD_LABELS[method],
      }),
    })
  } catch (err) {
    console.error('[booking-onsite] échec email chauffeur', err)
  }

  return { bookingId: booking.id, manageUrl }
}
