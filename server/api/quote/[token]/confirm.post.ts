import { z } from 'zod'
import { verifyClientToken, signClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { notifyDriver } from '~/server/utils/notify-driver'
import { ONSITE_METHODS, isOnSiteMethod, type PaymentMethod } from '~/lib/payment-methods'
import { isInstantPaymentOnly } from '~/server/utils/driver'

// Confirme une course SANS prépaiement en ligne : le client réserve et règle sur
// place le jour de la course (carte, espèces ou chèque selon ce qu'accepte le
// chauffeur). Crée Booking (CONFIRMED) + CalendarEvent + Payment (PENDING, encaissé
// le jour J), passe le devis en ACCEPTED et envoie l'email de confirmation.
const schema = z.object({
  method: z.enum(ONSITE_METHODS as [string, ...string[]]).optional(),
})

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'quote') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Moyen de paiement invalide.' })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: payload.ref },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.booking || quote.status === 'ACCEPTED') {
    throw createError({ statusCode: 409, statusMessage: 'Course déjà confirmée.' })
  }
  if (quote.status !== 'SENT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis ne peut pas être confirmé.' })
  }
  if (quote.expiresAt.getTime() < Date.now()) {
    throw createError({ statusCode: 410, statusMessage: 'Ce devis a expiré.' })
  }

  // Paiement immédiat : la réservation se règle par carte en ligne uniquement,
  // la confirmation « sur place » n'est pas ouverte (même si l'UI est contournée).
  if (isInstantPaymentOnly(quote.driver)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'La réservation se règle par carte en ligne pour ce chauffeur.',
    })
  }

  // Le chauffeur accepte-t-il l'encaissement sur place ?
  const accepted = (quote.driver.paymentMethods as PaymentMethod[]).filter(isOnSiteMethod)
  if (accepted.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le chauffeur ne propose pas le paiement sur place pour cette course.',
    })
  }
  // Moyen choisi par le client (s'il l'a précisé) ou premier moyen accepté.
  const method = (body.data.method as PaymentMethod | undefined) ?? accepted[0]!
  if (!accepted.includes(method)) {
    throw createError({ statusCode: 409, statusMessage: 'Ce moyen de paiement n’est pas accepté.' })
  }

  const req = quote.rideRequest
  if (!req.customerId) throw createError({ statusCode: 422, statusMessage: 'Client manquant.' })

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
      statusMessage: 'Ce créneau n’est plus disponible. Merci de contacter le chauffeur.',
    })
  }

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
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
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
    config.linkTokenSecret,
    '90d',
  )
  const tpl = emailTemplates.bookingConfirmedOnSite({
    driverName: quote.driver.displayName,
    amountCents: quote.amountCents,
    currency: quote.currency,
    scheduledAt: req.scheduledAt,
    method,
    manageUrl: `${config.public.appBaseUrl}/reservation/${manageToken}`,
    driverPhone: quote.driver.phone,
    driverEmail: quote.driver.contactEmail,
    siren: quote.driver.siren,
    companyName: quote.driver.companyName,
    vehicleMake: quote.driver.vehicleMake,
    vehicleModel: quote.driver.vehicleModel,
  })
  await sendEmail({ to: req.customerEmail, ...tpl })

  // Le chauffeur est prévenu par email : course confirmée, encaissement sur place.
  await notifyDriver(quote.driver, {
    email: emailTemplates.bookingConfirmedDriver({
      customerName: req.customerName,
      customerPhone: req.customerPhone,
      customerEmail: req.customerEmail,
      scheduledAt: req.scheduledAt,
      amountCents: quote.amountCents,
      currency: quote.currency,
      paidOnline: false,
      method,
      dashboardUrl: `${config.public.appBaseUrl}/dashboard/reservations`,
    }),
  })

  return { ok: true, method }
})
