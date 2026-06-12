import { z } from 'zod'
import { prisma } from '~/server/utils/prisma'
import { bookingSlot } from '~/server/utils/calendar'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { signClientToken } from '~/server/utils/tokens'

// ⚠️ OUTIL DE DÉVELOPPEMENT UNIQUEMENT — À RETIRER AVANT LA VERSION FINALE.
// Confirme une réservation sans passer par Stripe — simule le webhook checkout.session.completed.
// Utile pour tester le parcours complet (devis → cours confirmée) sans vrai paiement.
// Désactivé en production sauf si DEV_TOOLS=1.

const schema = z.object({ quoteId: z.string() })

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.public.devTools) {
    throw createError({ statusCode: 404, statusMessage: 'Not found.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'quoteId requis.' })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: body.data.quoteId },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.booking) throw createError({ statusCode: 409, statusMessage: 'Déjà confirmé.' })
  if (quote.status !== 'SENT') throw createError({ statusCode: 409, statusMessage: 'Devis non envoyé.' })

  const req = quote.rideRequest
  if (!req.customerId) throw createError({ statusCode: 422, statusMessage: 'Client manquant.' })

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
        stripeCheckoutSessionId: `dev_session_${Date.now()}`,
        amountCents: quote.amountCents,
        applicationFeeCents: quote.applicationFeeCents,
        currency: quote.currency,
        status: 'PAID',
      },
    })
    return booking
  })

  const manageToken = await signClientToken({ purpose: 'manage', ref: booking.id }, config.linkTokenSecret, '90d')
  const manageUrl = `${config.public.appBaseUrl}/reservation/${manageToken}`

  await sendEmail({
    to: req.customerEmail,
    ...emailTemplates.paymentConfirmed({
      driverName: quote.driver.displayName,
      amountCents: quote.amountCents,
      currency: quote.currency,
      scheduledAt: req.scheduledAt,
      manageUrl,
      driverPhone: quote.driver.phone,
      driverEmail: quote.driver.contactEmail,
      siren: quote.driver.siren,
      companyName: quote.driver.companyName,
      vehicleMake: quote.driver.vehicleMake,
      vehicleModel: quote.driver.vehicleModel,
    }),
  })

  return { ok: true, bookingId: booking.id, manageUrl }
})
