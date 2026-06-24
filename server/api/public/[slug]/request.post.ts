import { loadActiveDriverBySlug } from '~/server/utils/driver'
import { rideRequestSchema } from '~/server/utils/validation'
import { assertLeadTime, computeQuote } from '~/server/utils/quote-service'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { computeApplicationFee } from '~/lib/pricing'
import { prisma } from '~/server/utils/prisma'
import { newRequestMessage, sendTelegramMessage } from '~/server/utils/telegram'
import { ONSITE_METHODS, type PaymentMethod } from '~/lib/payment-methods'

// Soumission d'une demande de course par le client (sans compte).
// Crée/retrouve le client, enregistre la demande + un devis BROUILLON, détecte un
// conflit calendrier, puis notifie le chauffeur (Telegram + email de secours).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await loadActiveDriverBySlug(slug)
  const config = useRuntimeConfig()

  // Bloquer la demande seulement si AUCUN moyen de paiement n'est utilisable :
  // ni prépaiement en ligne (Stripe opérationnel) ni encaissement sur place.
  const methods = driver.paymentMethods as PaymentMethod[]
  const stripeReady = Boolean(driver.stripeAccountId) && driver.stripeChargesEnabled
  const hasUsableMethod = methods.some((m) =>
    m === 'STRIPE_PREPAYMENT' ? stripeReady : ONSITE_METHODS.includes(m),
  )
  if (!hasUsableMethod) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Les réservations ne sont pas encore disponibles pour ce chauffeur. Contactez-le directement.',
    })
  }

  const body = await readValidatedBody(event, (b) => rideRequestSchema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const input = body.data
  const scheduledAt = new Date(input.scheduledAt)

  try {
    assertLeadTime(driver, scheduledAt)
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }

  // Calcul du prix
  let computation
  try {
    computation = await computeQuote({
      driver,
      type: input.type,
      scheduledAt,
      pickup: input.pickup,
      dropoff: input.dropoff,
      roundTrip: input.roundTrip,
      durationHours: input.durationHours,
      apiKey: config.googleMapsApiKey || undefined,
    })
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }

  // Client (upsert sur driver + email)
  const customer = await prisma.customer.upsert({
    where: { driverId_email: { driverId: driver.id, email: input.customer.email } },
    update: { name: input.customer.name, phone: input.customer.phone },
    create: {
      driverId: driver.id,
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email,
    },
  })

  // Durée de service estimée (pour le créneau calendrier)
  const serviceDurationSeconds =
    input.type === 'TRANSFER'
      ? (computation.durationSeconds ?? 0) * (input.roundTrip ? 2 : 1)
      : (input.durationHours ?? 0) * 3600
  const slot = bookingSlot(driver, scheduledAt, serviceDurationSeconds)
  const conflict = await findConflict(driver.id, slot)

  const expiresAt = new Date(Date.now() + driver.quoteExpiryHours * 3_600_000)
  const applicationFeeCents = computeApplicationFee(
    computation.price.amountCents,
    driver.commissionBps,
  )

  // Demande + devis brouillon (transaction)
  const { quote } = await prisma.$transaction(async (tx) => {
    const rideRequest = await tx.rideRequest.create({
      data: {
        driverId: driver.id,
        customerId: customer.id,
        type: input.type,
        status: 'QUOTED',
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        customerEmail: input.customer.email,
        scheduledAt,
        pickupAddress: input.pickupAddress,
        pickupLat: input.pickup?.lat,
        pickupLng: input.pickup?.lng,
        dropoffAddress: input.dropoffAddress,
        dropoffLat: input.dropoff?.lat,
        dropoffLng: input.dropoff?.lng,
        roundTrip: input.roundTrip ?? false,
        distanceMeters: computation.distanceMeters,
        durationSeconds: computation.durationSeconds,
        durationHours: input.durationHours,
        notes: input.notes,
      },
    })
    const quote = await tx.quote.create({
      data: {
        driverId: driver.id,
        rideRequestId: rideRequest.id,
        status: 'DRAFT',
        computedAmountCents: computation.price.amountCents,
        amountCents: computation.price.amountCents,
        breakdown: computation.price.breakdown,
        currency: computation.price.currency,
        applicationFeeCents,
        expiresAt,
      },
    })
    return { quote }
  })

  // Notification chauffeur (Telegram + email de secours)
  if (driver.telegramChatId) {
    const msg = newRequestMessage({
      customerName: input.customer.name,
      type: input.type,
      scheduledAt,
      amountCents: computation.price.amountCents,
      currency: computation.price.currency,
      pickupAddress: input.pickupAddress,
      dropoffAddress: input.dropoffAddress,
      durationHours: input.durationHours,
      quoteId: quote.id,
      hasConflict: Boolean(conflict),
    })
    await sendTelegramMessage(driver.telegramChatId, msg.text, msg.buttons)
  }
  if (driver.contactEmail) {
    const { sendEmail } = await import('~/server/utils/email')
    await sendEmail({
      to: driver.contactEmail,
      subject: `Nouvelle demande de course — ${input.customer.name}`,
      html: `<p>Nouvelle demande pour le ${scheduledAt.toLocaleString('fr-FR')}.</p>
             <p>Connectez-vous à votre back-office pour valider le devis.</p>
             ${conflict ? '<p><strong>⚠️ Conflit calendrier détecté.</strong></p>' : ''}`,
    })
  }

  return {
    ok: true,
    quoteId: quote.id,
    hasConflict: Boolean(conflict),
    amountCents: computation.price.amountCents,
    currency: computation.price.currency,
  }
})
