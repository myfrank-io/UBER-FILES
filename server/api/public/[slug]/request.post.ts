import { loadActiveDriverBySlug, canAcceptBookings } from '~/server/utils/driver'
import { rideRequestSchema } from '~/server/utils/validation'
import { assertLeadTime, computeQuote } from '~/server/utils/quote-service'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { computeApplicationFee } from '~/lib/pricing'
import { prisma } from '~/server/utils/prisma'
import { newRequestMessage } from '~/server/utils/telegram'
import { notifyDriver } from '~/server/utils/notify-driver'
import { emailTemplates, sendEmail } from '~/server/utils/email'
import { sendQuoteToClient } from '~/server/utils/quote-actions'
import { createQuoteCheckoutUrl } from '~/server/utils/checkout'

// Soumission d'une demande de course par le client (sans compte).
// Crée/retrouve le client, enregistre la demande + un devis BROUILLON, détecte un
// conflit calendrier, puis notifie le chauffeur par email (Telegram si réactivé).
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

  // Paiement immédiat : si le chauffeur l'a activé et que le prépaiement en ligne
  // est opérationnel, le devis part automatiquement (même parcours que la validation
  // manuelle : SENT + email) et le client est redirigé vers la page de paiement.
  // En cas de conflit calendrier ou d'échec d'envoi, repli silencieux sur la
  // validation manuelle (le devis reste en DRAFT).
  let payUrl: string | null = null
  if (
    driver.autoAcceptQuotes &&
    !conflict &&
    driver.paymentMethods.includes('STRIPE_PREPAYMENT') &&
    canAcceptBookings(driver)
  ) {
    try {
      const sent = await sendQuoteToClient(quote.id, driver.id)
      // Paiement immédiat : on emmène le client directement sur la page de paiement
      // en ligne (Stripe/SumUp), sans passer par la page devis intermédiaire. Repli
      // sur la page devis si la création de la session de paiement échoue.
      try {
        const sentQuote = await prisma.quote.findUnique({
          where: { id: quote.id },
          include: { driver: true, rideRequest: true },
        })
        payUrl = sentQuote
          ? await createQuoteCheckoutUrl(sentQuote, sent.token)
          : sent.payUrl
      } catch {
        payUrl = sent.payUrl
      }
    } catch {
      // Le chauffeur validera manuellement.
    }
  }
  const autoSent = Boolean(payUrl)

  // Notification chauffeur : email (canal principal) + Telegram si réactivé.
  await notifyDriver(driver, {
    email: emailTemplates.newRequestDriver({
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      type: input.type,
      scheduledAt,
      pickupAddress: input.pickupAddress,
      dropoffAddress: input.dropoffAddress,
      roundTrip: input.roundTrip,
      durationHours: input.durationHours,
      amountCents: computation.price.amountCents,
      currency: computation.price.currency,
      hasConflict: Boolean(conflict),
      notes: input.notes,
      dashboardUrl: `${config.public.appBaseUrl}/dashboard`,
      autoSent,
    }),
    telegram: newRequestMessage({
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
      autoSent,
    }),
  })

  // Accusé de réception au client — uniquement en validation manuelle : en paiement
  // immédiat, le client est redirigé directement vers le paiement et a déjà reçu le
  // devis, donc ce message serait hors sujet. L'échec d'envoi ne bloque pas la demande.
  if (!autoSent) {
    try {
      await sendEmail({
        to: input.customer.email,
        ...emailTemplates.orderReceived({
          customerName: input.customer.name,
          driverName: driver.displayName,
          type: input.type,
          scheduledAt,
          pickupAddress: input.pickupAddress,
          dropoffAddress: input.dropoffAddress,
          roundTrip: input.roundTrip,
          durationHours: input.durationHours,
          amountCents: computation.price.amountCents,
          currency: computation.price.currency,
        }),
      })
    } catch {
      // Ne pas empêcher la prise en compte de la demande si l'accusé échoue.
    }
  }

  return {
    ok: true,
    quoteId: quote.id,
    hasConflict: Boolean(conflict),
    amountCents: computation.price.amountCents,
    currency: computation.price.currency,
    // Présent uniquement en paiement immédiat : le front redirige le client dessus.
    payUrl,
  }
})
