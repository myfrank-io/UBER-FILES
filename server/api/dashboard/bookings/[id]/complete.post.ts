import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { TRACKING_CLEAR_DATA } from '~/server/utils/tracking'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { PAYMENT_METHOD_SHORT_LABELS, isOnSiteMethod, type PaymentMethod } from '~/lib/payment-methods'
import { driverReviewUrl, reviewFunnelPath } from '~/lib/review-link'

// Le chauffeur marque une course comme terminée. Le client reçoit alors son
// reçu détaillé (récapitulatif, détail du prix, mentions légales du prestataire).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      driver: true,
      quote: { include: { rideRequest: true } },
      payments: { where: { status: 'PAID' } },
    },
  })

  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }
  if (booking.status !== 'CONFIRMED') {
    throw createError({ statusCode: 422, statusMessage: 'Seules les réservations confirmées peuvent être marquées comme terminées.' })
  }
  if (booking.scheduledAt > new Date()) {
    throw createError({ statusCode: 422, statusMessage: 'Impossible de terminer une course dont la date est dans le futur.' })
  }

  // Fin de course : purge des données de suivi (position, itinéraire, ETA) — RGPD.
  await prisma.booking.update({ where: { id }, data: { status: 'COMPLETED', ...TRACKING_CLEAR_DATA } })

  // Reçu client — l'échec d'envoi ne doit pas empêcher la clôture de la course.
  try {
    const req = booking.quote.rideRequest
    const rideLabel =
      req.type === 'TRANSFER'
        ? `Transfert — ${req.pickupAddress ?? ''} → ${req.dropoffAddress ?? ''}${req.roundTrip ? ' (aller-retour)' : ''}`
        : `Mise à disposition — ${req.durationHours ?? ''} h`

    // Libellé de paiement selon le règlement effectif : prépaiement en ligne,
    // encaissement sur place (carte/espèces/chèque), ou paiement direct hors app.
    const paid = booking.payments[0]
    let paymentLabel = 'Réglé directement auprès du chauffeur'
    if (paid) {
      const method = paid.method as PaymentMethod
      paymentLabel = isOnSiteMethod(method)
        ? `Réglé sur place (${PAYMENT_METHOD_SHORT_LABELS[method]})`
        : `Payé en ligne le ${paid.createdAt.toLocaleDateString('fr-FR')}`
    }
    const breakdown = Array.isArray(booking.quote.breakdown)
      ? (booking.quote.breakdown as { label: string; amountCents: number; detail?: string }[])
      : []

    const bookingRef = booking.id.slice(-8).toUpperCase()
    // Bouton « Laisser un avis » : pointe sur la page de notation Ridewiz (5★ →
    // dépôt public, 1-4★ → retour privé), jamais sur le lien externe en direct.
    // La référence de course permet au retour privé d'identifier la course.
    const config = useRuntimeConfig()
    const reviewUrl = driverReviewUrl(booking.driver)
      ? `${config.public.appBaseUrl}${reviewFunnelPath(booking.driver.slug)}?ref=${bookingRef}`
      : null

    const tpl = emailTemplates.paymentReceipt({
      driverName: booking.driver.displayName,
      companyName: booking.driver.companyName,
      siren: booking.driver.siren,
      customerName: req.customerName,
      scheduledAt: booking.scheduledAt,
      timezone: booking.driver.timezone,
      rideLabel,
      breakdown,
      amountCents: booking.amountCents,
      currency: booking.quote.currency,
      paymentLabel,
      bookingRef,
      reviewUrl,
    })
    await sendEmail({ to: req.customerEmail, ...tpl })
  } catch (err) {
    console.error('[receipt] envoi du reçu échoué', err)
  }

  return { ok: true }
})
