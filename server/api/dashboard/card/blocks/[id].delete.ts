import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  // deleteMany filtré sur la carte du chauffeur : supprime, ou ne fait rien si
  // le bloc appartient à quelqu'un d'autre (aucune fuite d'existence).
  const { count } = await prisma.cardBlock.deleteMany({
    where: { id, profile: { driverId } },
  })
  if (count === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Bloc introuvable.' })
  }

  return { ok: true }
})
