import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { encryptSecret } from '~/server/utils/crypto'
import { fetchMerchantCode } from '~/server/utils/sumup'

// Connexion SumUp par clé API (alternative à OAuth) : le chauffeur colle la clé
// secrète générée dans SON espace SumUp (Paramètres → Pour les développeurs →
// Clés API). On la valide en conditions réelles auprès de SumUp — elle doit donner
// accès au profil marchand — puis on la stocke chiffrée. Elle prime sur OAuth.
const schema = z.object({ apiKey: z.string().trim().min(20).max(200) })

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Clé API invalide.' })
  }
  const apiKey = body.data.apiKey

  const merchantCode = await fetchMerchantCode(apiKey)
  if (!merchantCode) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'SumUp a refusé cette clé. Vérifiez qu’elle est copiée en entier (elle commence par « sup_sk_ ») puis réessayez.',
    })
  }

  try {
    await prisma.driver.update({
      where: { id: driverId },
      data: {
        sumupApiKey: encryptSecret(apiKey),
        sumupMerchantCode: merchantCode,
        sumupConnected: true,
        paymentProvider: 'SUMUP',
        // La clé remplace toute connexion OAuth antérieure : jetons devenus inutiles.
        sumupAccessToken: null,
        sumupRefreshToken: null,
        sumupTokenExpiresAt: null,
      },
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Ce compte SumUp est déjà relié à un autre chauffeur.',
      })
    }
    throw e
  }

  return { ok: true, merchantCode }
})
