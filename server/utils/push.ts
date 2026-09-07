// Notifications push web (PWA) vers les appareils du chauffeur. Troisième canal
// de notifyDriver, à côté de l'email et de Telegram. Sans clés VAPID, on
// journalise simplement (dev/test), comme les deux autres.
import webpush from 'web-push'
import { prisma } from './prisma'
import type { PushPayload } from '~/lib/driver-push'

export type { PushPayload }

// Une notification ne vaut que sur le moment : au-delà d'une heure sans
// téléphone joignable, le service push l'abandonne.
const TTL_SECONDS = 60 * 60

export function pushConfigured(): boolean {
  const config = useRuntimeConfig()
  return Boolean(config.public.vapidPublicKey && config.vapidPrivateKey)
}

/** Envoie la notification à tous les appareils abonnés du chauffeur. */
export async function sendPushToDriver(driverId: string, payload: PushPayload): Promise<{ sent: number }> {
  const config = useRuntimeConfig()
  if (!config.public.vapidPublicKey || !config.vapidPrivateKey) {
    console.info(`[push:dev] → chauffeur ${driverId} | ${payload.title} — ${payload.body.slice(0, 80)}`)
    return { sent: 0 }
  }
  const subscriptions = await prisma.pushSubscription.findMany({ where: { driverId } })
  if (subscriptions.length === 0) return { sent: 0 }

  const vapidDetails = {
    subject: config.vapidSubject,
    publicKey: config.public.vapidPublicKey,
    privateKey: config.vapidPrivateKey,
  }
  const body = JSON.stringify(payload)
  let sent = 0
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: TTL_SECONDS, urgency: 'high', vapidDetails },
        )
        sent++
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 / 410 : abonnement expiré ou révoqué (app désinstallée, permission
        // retirée) — on l'oublie pour ne plus insister.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        } else {
          console.error(`[push] échec d'envoi (${status ?? 'réseau'}) pour le chauffeur ${driverId}`)
        }
      }
    }),
  )
  return { sent }
}
