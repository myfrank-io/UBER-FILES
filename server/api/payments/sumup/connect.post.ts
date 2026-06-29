import { SignJWT } from 'jose'
import { requireDriverId } from '~/server/utils/auth'
import { buildAuthorizeUrl } from '~/server/utils/sumup'

// Démarre la connexion OAuth SumUp du chauffeur. Renvoie l'URL d'autorisation
// vers laquelle le front redirige. Le `state` est un JWT court signé (anti-CSRF)
// qui transporte le driverId — vérifié au retour dans le callback.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const config = useRuntimeConfig()

  const state = await new SignJWT({ driverId, kind: 'sumup-oauth' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(config.linkTokenSecret))

  return { url: buildAuthorizeUrl(state) }
})
