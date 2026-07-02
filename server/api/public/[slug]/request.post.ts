import { loadActiveDriverBySlug } from '~/server/utils/driver'
import { rideRequestSchema } from '~/server/utils/validation'
import { assertLeadTime, computeQuote } from '~/server/utils/quote-service'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { computeApplicationFee } from '~/lib/pricing'
import { prisma } from '~/server/utils/prisma'
import { newRequestMessage, sendTelegramMessage } from '~/server/utils/telegram'

// Soumission d'une demande de course par le client (sans compte).
// Crée/retrouve le client, enregistre la demande + un devis BROUILLON, détecte un
// conflit calendrier, puis notifie le chauffeur (Telegram + email de secours).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await loadActiveDriverBySlug(slug)
  const config = useRuntimeConfig()

  // La demande est acceptée même si aucun moyen de paiement n'est encore configuré :
  // elle est transmise au chauffeur, qui valide le devis et règle le paiement
  // directement avec le client (le paiement en ligne reste optionnel, en aval).

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
