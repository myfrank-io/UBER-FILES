import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Enregistre (ou rafraîchit) l'abonnement push de cet appareil pour le chauffeur
// connecté. Le corps est le PushSubscription.toJSON() du navigateur.
const schema = z.object({
  endpoint: z.string().url().max(2048).refine((u) => u.startsWith('https://'), 'https requis'),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
  userAgent: z.string().max(400).optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const body = schema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Abonnement invalide' })
  const { endpoint, keys, userAgent } = body.data
  // Un même appareil re-abonné (ou passé à un autre compte) écrase l'ancien.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { driverId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null },
    update: { driverId, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null },
  })
  return { ok: true }
})
