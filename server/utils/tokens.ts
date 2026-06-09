import { SignJWT, jwtVerify } from 'jose'

// Jetons signés (JWS HS256) pour les actions client sans compte :
//  - "quote"  : consulter/payer un devis
//  - "manage" : modifier/annuler une réservation
// Le secret provient de runtimeConfig.linkTokenSecret.

export type ClientTokenPurpose = 'quote' | 'manage'

interface ClientTokenPayload {
  purpose: ClientTokenPurpose
  /** Id de la ressource ciblée (quoteId ou bookingId). */
  ref: string
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signClientToken(
  payload: ClientTokenPayload,
  secret: string,
  expiresIn: string | number = '30d',
): Promise<string> {
  return new SignJWT({ purpose: payload.purpose, ref: payload.ref })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret))
}

export async function verifyClientToken(
  token: string,
  secret: string,
): Promise<ClientTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret))
    if (
      (payload.purpose === 'quote' || payload.purpose === 'manage') &&
      typeof payload.ref === 'string'
    ) {
      return { purpose: payload.purpose, ref: payload.ref }
    }
    return null
  } catch {
    return null
  }
}
