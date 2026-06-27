import { jwtVerify } from 'jose'
import { exchangeCode, persistTokens, fetchMerchantCode } from '~/server/utils/sumup'

// Retour OAuth SumUp : SumUp renvoie le chauffeur ici avec ?code=...&state=...
// On vérifie le state (anti-CSRF), on échange le code contre les jetons, on les
// stocke chiffrés, puis on redirige vers les réglages. Aucune donnée n'est exposée.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : null
  const state = typeof query.state === 'string' ? query.state : null
  const settingsUrl = `${config.public.appBaseUrl}/dashboard/parametres`

  // L'utilisateur a refusé l'autorisation, ou paramètres manquants.
  if (query.error || !code || !state) {
    return sendRedirect(event, `${settingsUrl}?sumup=denied`)
  }

  // Vérifie le state signé et récupère le driverId.
  let driverId: string
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(config.linkTokenSecret))
    if (payload.kind !== 'sumup-oauth' || typeof payload.driverId !== 'string') {
      throw new Error('state invalide')
    }
    driverId = payload.driverId
  } catch {
    return sendRedirect(event, `${settingsUrl}?sumup=invalid_state`)
  }

  try {
    const tokens = await exchangeCode(code)
    const merchantCode = await fetchMerchantCode(tokens.access_token)
    await persistTokens(driverId, tokens, merchantCode)
  } catch {
    return sendRedirect(event, `${settingsUrl}?sumup=error`)
  }

  return sendRedirect(event, `${settingsUrl}?sumup=connected`)
})
