import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Le chauffeur désactive les notifications sur cet appareil : on oublie
// l'abonnement (seulement s'il est bien le sien).
const schema = z.object({ endpoint: z.string().url().max(2048) })

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const body = schema.safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Abonnement invalide' })
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.data.endpoint, driverId } })
  return { ok: true }
})
