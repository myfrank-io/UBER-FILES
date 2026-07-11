import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Déconnecte la fiche Google du chauffeur : le lien d'avis disparaît des
// messages automatiques (reçu de fin de course) et de sa page publique.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  await prisma.driver.update({
    where: { id: driverId },
    data: { googlePlaceId: null, googlePlaceName: null, googlePlaceAddress: null },
  })
  return { ok: true }
})
