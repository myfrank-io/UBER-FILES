import { loadActiveDriverBySlug, driverBookingMode } from '~/server/utils/driver'
import { rideRequestSchema } from '~/server/utils/validation'
import { assertLeadTime, computeQuote } from '~/server/utils/quote-service'
import { bookingSlot, findConflict } from '~/server/utils/calendar'
import { computeApplicationFee } from '~/lib/pricing'
import { resolveRequestPayment } from '~/lib/booking-policy'
import { PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'
import { prisma } from '~/server/utils/prisma'
import { newRequestMessage, driverFirstName } from '~/server/utils/telegram'
import { notifyDriver } from '~/server/utils/notify-driver'
import { emailTemplates, sendEmail } from '~/server/utils/email'
import { sendQuoteToClient } from '~/server/utils/quote-actions'
import { createQuoteCheckoutUrl } from '~/server/utils/checkout'
import { confirmQuoteOnSite } from '~/server/utils/booking-onsite'
import { pickupWithTerminal } from '~/lib/hubs'
import { airportRideLabel } from '~/lib/airport'

// Soumission d'une demande de course par le client (sans compte).
// Crée/retrouve le client, enregistre la demande + un devis BROUILLON, puis selon
// le mode du chauffeur : paiement en ligne immédiat (flux 1), confirmation
// automatique avec règlement sur place (flux 3), ou validation manuelle (flux 2/4)
// avec notification du chauffeur. Conflit calendrier → toujours validation manuelle.
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
      passengers: input.passengers,
      airport: input.airport,
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

  // Mode de réservation du chauffeur + règlement effectif de CETTE demande.
  // Le choix du client n'est retenu que s'il correspond à un moyen réellement
  // proposé (un choix invalide — formulaire en cache — est ignoré, pas rejeté).
  const mode = driverBookingMode(driver)
  const preferredPaymentMethod =
    input.paymentMethod &&
    ((input.paymentMethod === 'STRIPE_PREPAYMENT' && mode.onlineAvailable) ||
      mode.onSiteMethods.includes(input.paymentMethod as PaymentMethod))
      ? (input.paymentMethod as PaymentMethod)
      : null
  const resolved = resolveRequestPayment(mode, preferredPaymentMethod)

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
        passengers: input.passengers,
        pickupTerminal: input.pickupTerminal,
        flightNumber: input.flightNumber,
        airportHub: input.airport?.hub,
        airportDirection: input.airport?.direction,
        airportZone: input.airport?.zone,
        notes: input.notes,
        preferredPaymentMethod,
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

  // ── Flux 1 : paiement en ligne immédiat (la confirmation passe par le paiement).
  // Le devis part automatiquement (SENT + email) et le client est redirigé vers la
  // page de paiement. En cas de conflit calendrier ou d'échec d'envoi, repli
  // silencieux sur la validation manuelle (le devis reste en DRAFT).
  let payUrl: string | null = null
  if (mode.autoConfirm && !conflict && resolved.kind === 'ONLINE') {
    try {
      const sent = await sendQuoteToClient(quote.id, driver.id)
      // On emmène le client directement sur la page de paiement en ligne
      // (Stripe/SumUp), sans passer par la page devis intermédiaire. Repli sur la
      // page devis si la création de la session de paiement échoue.
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

  // ── Flux 3 : confirmation immédiate, règlement sur place le jour de la course.
  // La course est confirmée sans validation (créneau libre) : le client et le
  // chauffeur reçoivent directement leurs emails de confirmation. En cas d'échec
  // (course concurrente confirmée entre-temps…), repli sur la validation manuelle.
  let manageUrl: string | null = null
  let confirmed = false
  if (!autoSent && mode.autoConfirm && !conflict && resolved.kind === 'ONSITE') {
    try {
      const draftQuote = await prisma.quote.findUnique({
        where: { id: quote.id },
        include: { driver: true, rideRequest: true, booking: true },
      })
      if (draftQuote) {
        const result = await confirmQuoteOnSite(draftQuote, resolved.method, {
          autoConfirmed: true,
        })
        confirmed = true
        manageUrl = result.manageUrl
      }
    } catch {
      // Le chauffeur validera manuellement.
    }
  }

  // ── Validation manuelle (flux 2 & 4, replis compris) : notification chauffeur
  // + accusé de réception client. En flux 1 (autoSent), le chauffeur est informé
  // qu'aucune action n'est attendue ; en flux 3 (confirmed), les emails de
  // confirmation sont déjà partis — rien d'autre à envoyer.
  const paymentLabel =
    resolved.kind === 'ONLINE'
      ? 'En ligne (carte)'
      : resolved.kind === 'ONSITE'
        ? `Sur place — ${PAYMENT_METHOD_SHORT_LABELS[resolved.method]}`
        : undefined
  // Adresse de départ enrichie du terminal/hall choisi, pour l'affichage chauffeur.
  const pickupDisplay = pickupWithTerminal(input.pickupAddress, input.pickupTerminal)
  // Transfert aéroport : le trajet et le n° de vol sont mis en avant dans les
  // notifications (« Transfert aéroport — Orly → Rive gauche · vol AF1234 »).
  const airportLabel = input.airport ? airportRideLabel(input.airport) : undefined
  if (!confirmed) {
    await notifyDriver(driver, {
      email: emailTemplates.newRequestDriver({
        driverFirstName: driverFirstName(driver.displayName),
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        type: input.type,
        scheduledAt,
        timezone: driver.timezone,
        pickupAddress: pickupDisplay,
        dropoffAddress: input.dropoffAddress,
        roundTrip: input.roundTrip,
        durationHours: input.durationHours,
        airportLabel,
        flightNumber: input.flightNumber,
        amountCents: computation.price.amountCents,
        currency: computation.price.currency,
        hasConflict: Boolean(conflict),
        notes: input.notes,
        dashboardUrl: `${config.public.appBaseUrl}/dashboard`,
        autoSent,
        directAccept: !autoSent && resolved.kind === 'ONSITE',
        paymentLabel,
      }),
      telegram: newRequestMessage({
        driverDisplayName: driver.displayName,
        customerName: input.customer.name,
        type: input.type,
        scheduledAt,
        timezone: driver.timezone,
        amountCents: computation.price.amountCents,
        currency: computation.price.currency,
        pickupAddress: pickupDisplay,
        dropoffAddress: input.dropoffAddress,
        durationHours: input.durationHours,
        airportLabel,
        flightNumber: input.flightNumber,
        quoteId: quote.id,
        hasConflict: Boolean(conflict),
        autoSent,
      }),
    })
  }

  // Accusé de réception au client — uniquement en validation manuelle : en paiement
  // immédiat le client est redirigé vers le paiement (devis déjà reçu), en
  // confirmation immédiate il a déjà son email de confirmation. L'échec d'envoi ne
  // bloque pas la demande.
  if (!autoSent && !confirmed) {
    try {
      await sendEmail({
        to: input.customer.email,
        ...emailTemplates.orderReceived({
          customerName: input.customer.name,
          driverName: driver.displayName,
          type: input.type,
          scheduledAt,
          timezone: driver.timezone,
          pickupAddress: input.pickupAddress,
          dropoffAddress: input.dropoffAddress,
          roundTrip: input.roundTrip,
          durationHours: input.durationHours,
          airportLabel,
          amountCents: computation.price.amountCents,
          currency: computation.price.currency,
          paymentOnSite: resolved.kind === 'ONSITE',
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
    // Présent uniquement en paiement en ligne immédiat : le front redirige dessus.
    payUrl,
    // Présents uniquement en confirmation immédiate (règlement sur place).
    confirmed,
    manageUrl,
  }
})
