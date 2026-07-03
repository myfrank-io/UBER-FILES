import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Déconnecte le compte SumUp du chauffeur : efface jetons OAuth et clé API,
// et coupe l'encaissement en ligne.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      sumupAccessToken: null,
      sumupRefreshToken: null,
      sumupTokenExpiresAt: null,
      sumupApiKey: null,
      sumupMerchantCode: null,
      sumupConnected: false,
    },
  })
  return { ok: true }
})
