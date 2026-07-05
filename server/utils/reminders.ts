import { prisma } from './prisma'
import { signClientToken } from './tokens'
import { sendEmail, emailTemplates } from './email'
import { notifyDriver } from './notify-driver'
import { driverBookingMode } from './driver'
import { preRideAlertMessage, driverFirstName } from './telegram'
import { googleMapsNavUrl, wazeNavUrl } from '~/lib/nav-links'
import { formatMoney } from '~/lib/money'
import { isOnSiteMethod, PAYMENT_METHOD_SHORT_LABELS, type PaymentMethod } from '~/lib/payment-methods'

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
    // Libellé court (« Espèces ») : la phrase dit déjà « sur place ».
    const paymentNote = pendingOnSite
      ? `À encaisser sur place : ${formatMoney(pendingOnSite.amountCents, pendingOnSite.currency)} (${PAYMENT_METHOD_SHORT_LABELS[pendingOnSite.method as PaymentMethod]})`
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

// Relance des devis envoyés mais non payés qui expirent dans moins de 6 h :
// on renvoie au client le lien de paiement avant que le créneau soit perdu.
// Ne concerne que les chauffeurs dont le paiement en ligne est opérationnel
// (un devis « règlement sur place » n'a rien à payer en ligne). Idempotent
// via WebhookEvent : une seule relance par devis.
export async function sendQuoteExpiryReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const config = useRuntimeConfig()
  const windowEnd = new Date(now.getTime() + 6 * 3_600_000)

  const quotes = await prisma.quote.findMany({
    where: {
      status: 'SENT',
      booking: null,
      expiresAt: { gt: now, lte: windowEnd },
      // La course elle-même doit être encore à venir.
      rideRequest: { scheduledAt: { gt: now } },
    },
    include: { driver: true, rideRequest: true },
  })

  let sent = 0
  for (const q of quotes) {
    const key = `quote-reminder:${q.id}`
    const existing = await prisma.webhookEvent.findUnique({ where: { id: key } })
    if (existing) continue

    // Relance uniquement si le client peut effectivement payer en ligne.
    if (!driverBookingMode(q.driver).onlineAvailable) continue

    const payToken = await signClientToken({ purpose: 'quote', ref: q.id }, config.linkTokenSecret, '7d')
    const tpl = emailTemplates.quoteExpiringReminder({
      driverName: q.driver.displayName,
      amountCents: q.amountCents,
      currency: q.currency,
      scheduledAt: q.rideRequest.scheduledAt,
      payUrl: `${config.public.appBaseUrl}/devis/${payToken}`,
      expiresAt: q.expiresAt,
    })
    await sendEmail({ to: q.rideRequest.customerEmail, ...tpl })
    await prisma.webhookEvent.create({
      data: { id: key, provider: 'cron', type: 'quote-reminder', processedAt: new Date() },
    })
    sent++
  }
  return { sent }
}

// Notice « devis expiré » : un devis SENT non payé dont la fenêtre de paiement
// vient de se clore (délai dépassé OU course déjà passée). On prévient le client
// une fois, dans les 24 h suivant l'expiration, avec un lien pour refaire une
// demande. Idempotent via WebhookEvent (clé quote-expired:{id}).
export async function sendExpiredQuoteNotices(now: Date = new Date()): Promise<{ sent: number }> {
  const config = useRuntimeConfig()
  const since = new Date(now.getTime() - 24 * 3_600_000)

  // Candidats : SENT, non réservés, dont expiresAt OU scheduledAt est passé récemment.
  const quotes = await prisma.quote.findMany({
    where: {
      status: 'SENT',
      booking: null,
      OR: [
        { expiresAt: { lte: now, gt: since } },
        { rideRequest: { scheduledAt: { lte: now, gt: since } } },
      ],
    },
    include: { driver: true, rideRequest: true },
  })

  let sent = 0
  for (const q of quotes) {
    const key = `quote-expired:${q.id}`
    const existing = await prisma.webhookEvent.findUnique({ where: { id: key } })
    if (existing) continue

    const tpl = emailTemplates.quoteExpiredNotice({
      driverName: q.driver.displayName,
      scheduledAt: q.rideRequest.scheduledAt,
      rebookUrl: `${config.public.appBaseUrl}/${q.driver.slug}`,
    })
    await sendEmail({ to: q.rideRequest.customerEmail, ...tpl })
    await prisma.webhookEvent.create({
      data: { id: key, provider: 'cron', type: 'quote-expired', processedAt: new Date() },
    })
    sent++
  }
  return { sent }
}

// Récap hebdomadaire chauffeur : envoyé le lundi (créneau matinal) avec les
// courses à venir sur 7 jours et le bilan de la semaine écoulée. Idempotent par
// chauffeur et par semaine ISO (clé weekly-recap:{driverId}:{year}-W{week}).
export async function sendWeeklyDriverRecap(now: Date = new Date()): Promise<{ sent: number }> {
  const config = useRuntimeConfig()

  // Ne s'exécute que le lundi, à partir de 7 h (heure serveur, UTC). L'idempotence
  // hebdomadaire garantit un seul envoi même si le cron tourne plusieurs fois.
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 7) return { sent: 0 }

  const weekKey = isoWeekKey(now)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000)
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3_600_000)

  const drivers = await prisma.driver.findMany({
    where: { status: 'ACTIVE' },
    include: {
      bookings: {
        where: {
          OR: [
            { status: 'CONFIRMED', scheduledAt: { gte: now, lte: weekAhead } },
            { status: 'COMPLETED', scheduledAt: { gte: weekAgo, lte: now } },
          ],
        },
        include: { quote: { include: { rideRequest: true } } },
        orderBy: { scheduledAt: 'asc' },
      },
    },
  })

  let sent = 0
  for (const d of drivers) {
    const key = `weekly-recap:${d.id}:${weekKey}`
    const existing = await prisma.webhookEvent.findUnique({ where: { id: key } })
    if (existing) continue

    const upcoming = d.bookings.filter((b) => b.status === 'CONFIRMED')
    const done = d.bookings.filter((b) => b.status === 'COMPLETED')
    const lastWeekEarningsCents = done.reduce((sum, b) => sum + b.amountCents, 0)

    // Rien à raconter (ni passé ni futur) : on n'envoie pas d'email vide.
    if (upcoming.length === 0 && done.length === 0) {
      await prisma.webhookEvent.create({
        data: { id: key, provider: 'cron', type: 'weekly-recap', processedAt: new Date() },
      })
      continue
    }

    await notifyDriver(d, {
      email: emailTemplates.weeklyDriverRecap({
        driverFirstName: driverFirstName(d.displayName),
        upcomingCount: upcoming.length,
        upcoming: upcoming.slice(0, 5).map((b) => ({
          scheduledAt: b.scheduledAt,
          customerName: b.quote.rideRequest.customerName,
          label:
            b.quote.rideRequest.type === 'TRANSFER'
              ? 'Transfert'
              : `Mise à disposition ${b.quote.rideRequest.durationHours ?? ''} h`,
        })),
        lastWeekCount: done.length,
        lastWeekEarningsCents,
        currency: d.currency,
        dashboardUrl: `${config.public.appBaseUrl}/dashboard`,
      }),
    })
    await prisma.webhookEvent.create({
      data: { id: key, provider: 'cron', type: 'weekly-recap', processedAt: new Date() },
    })
    sent++
  }
  return { sent }
}

/** Clé « année-semaine ISO » (ex: "2026-W27") pour l'idempotence hebdomadaire. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
