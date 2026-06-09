import { prisma } from './prisma'
import { signClientToken } from './tokens'
import { sendEmail, emailTemplates } from './email'

// Envoi des rappels J-1 : pour chaque course confirmée dont la prise en charge a lieu
// dans ~24h et qui n'a pas encore reçu de rappel, on notifie le client par email.
// Idempotent grâce au flag stocké via WebhookEvent (clé déterministe par booking+jour).
export async function sendDueReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const config = useRuntimeConfig()
  const windowStart = new Date(now.getTime() + 23 * 3_600_000)
  const windowEnd = new Date(now.getTime() + 25 * 3_600_000)

  const bookings = await prisma.booking.findMany({
    where: { status: 'CONFIRMED', scheduledAt: { gte: windowStart, lte: windowEnd } },
    include: { driver: true, quote: { include: { rideRequest: true } } },
  })

  let sent = 0
  for (const b of bookings) {
    const reminderKey = `reminder:${b.id}`
    // Idempotence : on n'envoie qu'une fois.
    const existing = await prisma.webhookEvent.findUnique({ where: { id: reminderKey } })
    if (existing) continue

    const manageToken = await signClientToken({ purpose: 'manage', ref: b.id }, config.linkTokenSecret, '90d')
    const tpl = emailTemplates.reminder({
      driverName: b.driver.displayName,
      scheduledAt: b.scheduledAt,
      manageUrl: `${config.public.appBaseUrl}/reservation/${manageToken}`,
    })
    await sendEmail({ to: b.quote.rideRequest.customerEmail, ...tpl })
    await prisma.webhookEvent.create({
      data: { id: reminderKey, provider: 'cron', type: 'reminder', processedAt: new Date() },
    })
    sent++
  }
  return { sent }
}
