// Chiffrement symétrique des secrets stockés en base (jetons OAuth SumUp des chauffeurs).
// AES-256-GCM : confidentialité + authenticité. La clé provient de
// SUMUP_TOKEN_ENCRYPTION_KEY (32 octets, générée via `openssl rand -base64 32`).
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const ALGO = 'aes-256-gcm'

/** Dérive une clé 32 octets à partir du secret d'env (accepte base64 ou texte libre). */
function getKey(): Buffer {
  const config = useRuntimeConfig()
  const secret = config.sumupTokenEncryptionKey
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'Chiffrement non configuré (SUMUP_TOKEN_ENCRYPTION_KEY).' })
  }
  // sha256 garantit une clé de 32 octets quelle que soit la longueur du secret fourni.
  return createHash('sha256').update(secret).digest()
}

/** Chiffre une chaîne. Format de sortie : base64(iv).base64(tag).base64(ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

/** Déchiffre une chaîne produite par encryptSecret. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw createError({ statusCode: 500, statusMessage: 'Secret chiffré illisible.' })
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
