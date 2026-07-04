import { prisma } from './prisma'
import { signClientToken } from './tokens'
import { sendEmail, emailTemplates } from './email'
import { notifyDriver } from './notify-driver'
import { preRideAlertMessage, driverFirstName } from './telegram'
import { googleMapsNavUrl, wazeNavUrl } from '~/lib/nav-links'
import { formatMoney } from '~/lib/money'
import { isOnSiteMethod, PAYMENT_METHOD_LABELS, type PaymentMethod } from '~/lib/payment-methods'

// Envoi des rappels J-1 : pour chaque course confirmée dont la prise en charge a lieu
// dans ~24h et qui n'a pas encore reçu de rappel, on notifie le client par email.
// Idempotent grâce au flag stocké via WebhookEvent (clé déterministe par booking+jour).
export async function sendDueReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const config = useRuntimeConfig()
  const windowStart = new Date(now.getTime() + 23 * 3_600_000)
  const windowEnd = new Date(now.getTime() + 25 * 3_600_000)

  const bookings = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', scheduledAt: { gte: windowStart, lte: windowEnd } },
    include: { driver: true, quote: { include: { rideRequest: true } }, payments: true },
  })

  let sent = 0
  for (const b of bookings) {
    const reminderKey = `reminder:${b.id}`
    // Idempotence : on n'envoie qu'une fois.
    const existing = await prisma.webhookEvent.findUnique({ where: { id: reminderKey } })
    if (existing) continue

    // Encaissement sur place encore attendu : le rappel précise montant et moyen.
    const pendingOnSite = b.payments.find(
      (p) => p.status === 'PENDING' && isOnSiteMethod(p.method as PaymentMethod),
    )

    const manageToken = await signClientToken({ purpose: 'manage', ref: b.id }, config.linkTokenSecret, '90d')
    const tpl = emailTemplates.reminder({
      driverName: b.driver.displayName,
      scheduledAt: b.scheduledAt,
      manageUrl: `${config.public.appBaseUrl}/reservation/${manageToken}`,
      driverPhone: b.driver.phone,
      driverEmail: b.driver.contactEmail,
      amountCents: pendingOnSite?.amountCents,
      currency: pendingOnSite?.currency,
      onSiteMethod: (pendingOnSite?.method as PaymentMethod | undefined) ?? null,
    })
    await sendEmail({ to: b.quote.rideRequest.customerEmail, ...tpl })
    await prisma.webhookEvent.create({
      data: { id: reminderKey, provider: 'cron', type: 'reminder', processedAt: new Date() },
    })
    sent++
  }
  return { sent }
}

// Alerte pré-course chauffeur (~H-2) : récap de la course, contact client et
// liens de navigation « un tap » (Google Maps / Waze) vers le départ.
// Fenêtre large (1 h → 3 h) + idempotence : avec un cron horaire, chaque course
// est vue une à deux fois mais l'alerte ne part qu'une seule fois.
export async function sendPreRideAlerts(now: Date = new Date()): Promise<{ sent: number }> {
  const windowStart = new Date(now.getTime() + 1 * 3_600_000)
  const windowEnd = new Date(now.getTime() + 3 * 3_600_000)

  const bookings = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', scheduledAt: { gte: windowStart, lte: windowEnd } },
    include: { driver: true, quote: { include: { rideRequest: true } }, payments: true },
  })

  let sent = 0
  for (const b of bookings) {
    const alertKey = `preride:${b.id}`
    const existing = await prisma.webhookEvent.findUnique({ where: { id: alertKey } })
    if (existing) continue

    const req = b.quote.rideRequest

    // Note de règlement : encaissement sur place attendu, ou course déjà payée.
    const pendingOnSite = b.payments.find(
      (p) => p.status === 'PENDING' && isOnSiteMethod(p.method as PaymentMethod),
    )
    const paymentNote = pendingOnSite
      ? `À encaisser sur place : ${formatMoney(pendingOnSite.amountCents, pendingOnSite.currency)} (${PAYMENT_METHOD_LABELS[pendingOnSite.method as PaymentMethod]})`
      : `Course déjà réglée en ligne — rien à encaisser.`
    const paymentNoteEmoji = `${pendingOnSite ? '💶' : '💳'} ${paymentNote}`

    const pickup = { address: req.pickupAddress, lat: req.pickupLat, lng: req.pickupLng }
    const mapsUrl = googleMapsNavUrl(pickup)
    const wazeUrl = wazeNavUrl(pickup)

    await notifyDriver(b.driver, {
      email: emailTemplates.preRideDriver({
        driverFirstName: driverFirstName(b.driver.displayName),
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        scheduledAt: b.scheduledAt,
        type: req.type,
        durationHours: req.durationHours,
        pickupAddress: req.pickupAddress,
        dropoffAddress: req.dropoffAddress,
        mapsUrl,
        wazeUrl,
        paymentNote,
      }),
      telegram: preRideAlertMessage({
        driverDisplayName: b.driver.displayName,
        customerName: req.customerName,
        customerPhone: req.customerPhone,
        scheduledAt: b.scheduledAt,
        type: req.type,
        durationHours: req.durationHours,
        pickupAddress: req.pickupAddress,
        dropoffAddress: req.dropoffAddress,
        mapsUrl,
        wazeUrl,
        paymentNote: paymentNoteEmoji,
      }),
    })
    await prisma.webhookEvent.create({
      data: { id: alertKey, provider: 'cron', type: 'preride', processedAt: new Date() },
    })
    sent++
  }
  return { sent }
}
