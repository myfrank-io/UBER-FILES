import { prisma } from './prisma'
import { signClientToken } from './tokens'
import { sendEmail, emailTemplates } from './email'
import { bookingSlot, findConflict } from './calendar'
import { canAcceptBookings, driverBookingMode } from './driver'
import { confirmQuoteOnSite } from './booking-onsite'
import { onSitePaymentMethods, resolveRequestPayment } from '~/lib/booking-policy'
import type { PaymentMethod } from '~/lib/payment-methods'

// Actions métier sur les devis, partagées entre le back-office et le bot Telegram.

export interface SendQuoteResult {
  ok: boolean
  payUrl: string
  amountCents: number
  // Jeton signé du devis (permet de construire l'URL de paiement en ligne directe).
  token: string
}

/**
 * Valide (et éventuellement ajuste) un devis, le passe en SENT, et envoie au client
 * l'email avec le lien de paiement. Vérifie l'absence de conflit calendrier.
 */
export async function sendQuoteToClient(
  quoteId: string,
  driverId: string,
  adjustedAmountCents?: number,
): Promise<SendQuoteResult> {
  const config = useRuntimeConfig()
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, driverId },
    include: { driver: true, rideRequest: true },
  })
  if (!quote) {
    throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  }
  if (quote.status !== 'DRAFT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }
  // Course déjà passée : la demande n'est plus validable (l'accueil l'archive
  // dans « Demandes expirées », mais on protège aussi les clients obsolètes :
  // onglet resté ouvert, bouton Telegram tardif…).
  if (quote.rideRequest.scheduledAt.getTime() <= Date.now()) {
    throw createError({
      statusCode: 410,
      statusMessage: 'La date de cette course est déjà passée — demande expirée.',
    })
  }

  // Re-vérifier le conflit calendrier au moment de la validation.
  const serviceDurationSeconds =
    quote.rideRequest.type === 'TRANSFER'
      ? (quote.rideRequest.durationSeconds ?? 0) * (quote.rideRequest.roundTrip ? 2 : 1)
      : (quote.rideRequest.durationHours ?? 0) * 3600
  const slot = bookingSlot(quote.driver, quote.rideRequest.scheduledAt, serviceDurationSeconds)
  const conflict = await findConflict(driverId, slot)
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage: `Conflit calendrier avec « ${conflict.title ?? 'événement'} ».`,
    })
  }

  const amountCents = adjustedAmountCents ?? quote.amountCents
  const expiresAt = new Date(Date.now() + quote.driver.quoteExpiryHours * 3_600_000)

  // Transition conditionnelle : refuse la validation si le devis a été traité
  // entre-temps (double clic, deuxième onglet, bot Telegram…).
  const transitioned = await prisma.quote.updateMany({
    where: { id: quote.id, status: 'DRAFT' },
    data: { status: 'SENT', amountCents, sentAt: new Date(), expiresAt },
  })
  if (transitioned.count === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }

  // Le jeton du lien vit plus longtemps que le devis : passé l'expiration business
  // (expiresAt, contrôlée au paiement), le client voit la page « devis expiré »
  // plutôt qu'un lien mort — et le chauffeur peut renvoyer le devis.
  const token = await signClientToken(
    { purpose: 'quote', ref: quote.id },
    config.linkTokenSecret,
    '30d',
  )
  const payUrl = `${config.public.appBaseUrl}/devis/${token}`

  // Le chauffeur propose-t-il le prépaiement en ligne ? et/ou le règlement sur
  // place ? (adaptent le libellé du bouton de l'email)
  const prepayment =
    quote.driver.paymentMethods.includes('STRIPE_PREPAYMENT') && canAcceptBookings(quote.driver)
  const onSiteAvailable =
    onSitePaymentMethods(quote.driver.paymentMethods as PaymentMethod[]).length > 0
  const tpl = emailTemplates.quoteSent({
    driverName: quote.driver.displayName,
    amountCents,
    currency: quote.currency,
    payUrl,
    expiresAt,
    prepayment,
    onSiteAvailable,
    type: quote.rideRequest.type,
    scheduledAt: quote.rideRequest.scheduledAt,
    pickupAddress: quote.rideRequest.pickupAddress,
    dropoffAddress: quote.rideRequest.dropoffAddress,
    roundTrip: quote.rideRequest.roundTrip,
    durationHours: quote.rideRequest.durationHours,
    // Estimation initiale : sert à détecter et afficher un éventuel ajustement du tarif.
    originalAmountCents: quote.computedAmountCents,
  })
  // Un échec d'email ne doit pas bloquer le devis en état « déjà traité » sans
  // recours : le devis est SENT, le chauffeur dispose de « Relancer le client »
  // (et en paiement immédiat, le client est de toute façon redirigé vers le paiement).
  try {
    await sendEmail({ to: quote.rideRequest.customerEmail, ...tpl })
  } catch (err) {
    console.error('[quote-actions] échec email devis', err)
  }

  return { ok: true, payUrl, amountCents, token }
}

export interface AcceptQuoteResult {
  ok: boolean
  // True : course confirmée directement (règlement sur place), aucune étape client.
  confirmed: boolean
  // Renseignés quand le devis a été envoyé au client (paiement en ligne attendu).
  payUrl?: string
  amountCents?: number
}

/**
 * Le chauffeur accepte une demande SANS ajuster le prix. Selon le règlement
 * effectif de la demande :
 *  - sur place → la course est confirmée immédiatement (flux 4) : Booking +
 *    calendrier + emails de confirmation, sans étape client supplémentaire ;
 *  - en ligne (exigé ou choisi par le client) → parcours devis classique (flux 2) :
 *    le client reçoit le lien pour payer et confirmer.
 * Un ajustement de prix passe toujours par `sendQuoteToClient` (le client doit
 * accepter le nouveau tarif).
 */
export async function acceptQuote(quoteId: string, driverId: string): Promise<AcceptQuoteResult> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, driverId },
    include: { driver: true, rideRequest: true, booking: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.status !== 'DRAFT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }
  // Même garde que sendQuoteToClient : une course passée ne se confirme plus
  // (la voie « sur place » créerait sinon une réservation dans le passé).
  if (quote.rideRequest.scheduledAt.getTime() <= Date.now()) {
    throw createError({
      statusCode: 410,
      statusMessage: 'La date de cette course est déjà passée — demande expirée.',
    })
  }

  const mode = driverBookingMode(quote.driver)
  const resolved = resolveRequestPayment(
    mode,
    quote.rideRequest.preferredPaymentMethod as PaymentMethod | null,
  )

  if (resolved.kind === 'ONSITE') {
    await confirmQuoteOnSite(quote, resolved.method, { acceptedByDriver: true })
    return { ok: true, confirmed: true }
  }

  const sent = await sendQuoteToClient(quoteId, driverId)
  return { ok: true, confirmed: false, payUrl: sent.payUrl, amountCents: sent.amountCents }
}

/** Refuse un devis (DRAFT → REJECTED) et prévient le client par email. */
export async function rejectQuote(quoteId: string, driverId: string): Promise<void> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, driverId },
    include: { driver: true, rideRequest: true },
  })
  if (!quote) throw createError({ statusCode: 404, statusMessage: 'Devis introuvable.' })
  if (quote.status !== 'DRAFT') {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }
  // Transition conditionnelle : ne refuse pas un devis accepté/envoyé entre-temps.
  const rejected = await prisma.quote.updateMany({
    where: { id: quote.id, status: 'DRAFT' },
    data: { status: 'REJECTED' },
  })
  if (rejected.count === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Ce devis a déjà été traité.' })
  }
  await prisma.rideRequest.update({
    where: { id: quote.rideRequestId },
    data: { status: 'CANCELLED' },
  })

  // Le client est prévenu (rien ne lui a été débité) et peut refaire une demande.
  const config = useRuntimeConfig()
  const req = quote.rideRequest
  try {
    await sendEmail({
      to: req.customerEmail,
      ...emailTemplates.requestRejected({
        customerName: req.customerName,
        driverName: quote.driver.displayName,
        type: req.type,
        scheduledAt: req.scheduledAt,
        pickupAddress: req.pickupAddress,
        dropoffAddress: req.dropoffAddress,
        roundTrip: req.roundTrip,
        durationHours: req.durationHours,
        rebookUrl: `${config.public.appBaseUrl}/${quote.driver.slug}`,
      }),
    })
  } catch (err) {
    // Le refus est enregistré même si l'email échoue.
    console.error('[quote-actions] échec email de refus', err)
  }
}
