import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { isCardImageRole } from '~/server/utils/card'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const role = getRouterParam(event, 'role')
  if (!isCardImageRole(role)) {
    throw createError({ statusCode: 404, statusMessage: 'Image inconnue.' })
  }

  // Retirer une image déjà absente n'est pas une erreur : l'éditeur peut
  // rejouer l'action sans conséquence.
  await prisma.cardImage.deleteMany({ where: { role, profile: { driverId } } })

  return { ok: true }
})
