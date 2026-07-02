import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Déconnecte le compte SumUp du chauffeur : efface les jetons et coupe l'encaissement.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      sumupAccessToken: null,
      sumupRefreshToken: null,
      sumupTokenExpiresAt: null,
      sumupMerchantCode: null,
      sumupConnected: false,
    },
  })
  return { ok: true }
})
