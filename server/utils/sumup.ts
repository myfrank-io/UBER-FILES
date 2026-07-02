// Intégration SumUp (OAuth2 + Hosted Checkout). Modèle « merchant of record » :
// chaque chauffeur connecte SON compte SumUp, l'argent va directement chez lui.
// La plateforme n'encaisse rien — elle crée les checkouts au nom du chauffeur via son token.
import type { Driver } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { encryptSecret, decryptSecret } from '~/server/utils/crypto'

const API_BASE = 'https://api.sumup.com'

// Scopes demandés à l'autorisation. `payments` est restreint côté SumUp et nécessite
// une validation de leur support — sans lui, la connexion fonctionne mais pas les checkouts.
export const SUMUP_SCOPES = ['payments', 'transactions.history', 'user.profile_readonly']

interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number // secondes
}

function getConfig() {
  const config = useRuntimeConfig()
  if (!config.sumupClientId || !config.sumupClientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'SumUp non configuré.' })
  }
  return {
    clientId: config.sumupClientId,
    clientSecret: config.sumupClientSecret,
    redirectUri: config.sumupRedirectUri,
  }
}

/** URL d'autorisation OAuth vers laquelle rediriger le chauffeur. */
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getConfig()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SUMUP_SCOPES.join(' '),
    state,
  })
  return `${API_BASE}/authorize?${params.toString()}`
}

/** Échange le code d'autorisation contre des jetons (étape callback). */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getConfig()
  const res = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: `Échange OAuth SumUp échoué (${res.status}).` })
  }
  return res.json() as Promise<TokenResponse>
}

/** Renouvelle un access_token expiré via le refresh_token. */
async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getConfig()
  const res = await fetch(`${API_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: 'Rafraîchissement du jeton SumUp échoué — reconnexion requise.' })
  }
  return res.json() as Promise<TokenResponse>
}

/** Persiste les jetons (chiffrés) + l'expiration sur le chauffeur. */
export async function persistTokens(driverId: string, tokens: TokenResponse, merchantCode?: string): Promise<void> {
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      sumupAccessToken: encryptSecret(tokens.access_token),
      sumupRefreshToken: encryptSecret(tokens.refresh_token),
      sumupTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      sumupConnected: true,
      paymentProvider: 'SUMUP',
      ...(merchantCode ? { sumupMerchantCode: merchantCode } : {}),
    },
  })
}

/**
 * Renvoie un access_token valide pour le chauffeur, en le rafraîchissant si nécessaire.
 * Lève une erreur si le chauffeur n'est pas connecté à SumUp.
 */
export async function getValidAccessToken(driver: Driver): Promise<string> {
  if (!driver.sumupConnected || !driver.sumupAccessToken || !driver.sumupRefreshToken) {
    throw createError({ statusCode: 503, statusMessage: 'Chauffeur non connecté à SumUp.' })
  }
  // Marge de 60 s pour éviter d'utiliser un token au bord de l'expiration.
  const stillValid = driver.sumupTokenExpiresAt && driver.sumupTokenExpiresAt.getTime() - 60_000 > Date.now()
  if (stillValid) {
    return decryptSecret(driver.sumupAccessToken)
  }
  const refreshed = await refreshTokens(decryptSecret(driver.sumupRefreshToken))
  await persistTokens(driver.id, refreshed)
  return refreshed.access_token
}

/** Récupère le merchant_code du compte connecté (identifie le chauffeur côté SumUp). */
export async function fetchMerchantCode(accessToken: string): Promise<string | undefined> {
  const res = await fetch(`${API_BASE}/v0.1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return undefined
  const me = (await res.json()) as { merchant_profile?: { merchant_code?: string } }
  return me.merchant_profile?.merchant_code
}

export interface SumupCheckout {
  id: string
  status: string // PENDING | PAID | FAILED
  hosted_checkout_url?: string
}

/**
 * Crée un Hosted Checkout SumUp : montant libre défini à la volée (le devis).
 * Renvoie l'URL hébergée vers laquelle rediriger le client pour payer.
 */
export async function createHostedCheckout(opts: {
  accessToken: string
  merchantCode: string
  checkoutReference: string // notre quoteId
  amount: number // en unités majeures (euros), pas en centimes
  currency: string
  description: string
  returnUrl: string
  redirectUrl: string
}): Promise<SumupCheckout> {
  const res = await fetch(`${API_BASE}/v0.1/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      checkout_reference: opts.checkoutReference,
      amount: opts.amount,
      currency: opts.currency.toUpperCase(),
      merchant_code: opts.merchantCode,
      description: opts.description,
      return_url: opts.returnUrl, // webhook serveur (statut du checkout)
      hosted_checkout: { enabled: true },
      redirect_url: opts.redirectUrl, // retour navigateur du client après paiement
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw createError({ statusCode: 502, statusMessage: `Création du checkout SumUp échouée (${res.status}). ${detail}` })
  }
  return res.json() as Promise<SumupCheckout>
}

/** Lit l'état d'un checkout (utilisé par le webhook et en repli par polling). */
export async function getCheckout(accessToken: string, checkoutId: string): Promise<SumupCheckout & {
  transactions?: { id: string; transaction_code: string; status: string }[]
}> {
  const res = await fetch(`${API_BASE}/v0.1/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: `Lecture du checkout SumUp échouée (${res.status}).` })
  }
  return res.json()
}

/** Rembourse une transaction SumUp (totale si amount omis, sinon partielle). */
export async function refundTransaction(accessToken: string, transactionId: string, amount?: number): Promise<void> {
  const res = await fetch(`${API_BASE}/v0.1/me/refund/${transactionId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(amount != null ? { amount } : {}),
  })
  if (!res.ok) {
    throw createError({ statusCode: 502, statusMessage: `Remboursement SumUp échoué (${res.status}).` })
  }
}
