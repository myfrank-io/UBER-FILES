// Code de vérification par email du parcours de configuration.
//
// Logique PURE et testée : génération, masquage de l'email affiché, règles
// de validité et de renvoi. Le hachage et la persistance vivent côté serveur
// (server/utils/setup.ts).

/** Durée de validité d'un code. */
export const SETUP_CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
/** Délai minimal entre deux envois. */
export const SETUP_CODE_RESEND_DELAY_MS = 30 * 1000
/** Essais autorisés par code envoyé. */
export const SETUP_CODE_MAX_ATTEMPTS = 5
export const SETUP_CODE_LENGTH = 6

/** Code à 6 chiffres à partir d'octets aléatoires (fournis par l'appelant). */
export function codeFromRandomBytes(bytes: Uint8Array): string {
  if (bytes.length < 4) throw new Error('4 octets aléatoires minimum.')
  // 32 bits → entier → modulo 10^6, complété à gauche.
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return String(n % 10 ** SETUP_CODE_LENGTH).padStart(SETUP_CODE_LENGTH, '0')
}

/** Ne garde que les chiffres saisis (espaces, tirets… tolérés). */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, SETUP_CODE_LENGTH)
}

export function isCodeShape(input: string): boolean {
  return new RegExp(`^\\d{${SETUP_CODE_LENGTH}}$`).test(input)
}

/**
 * Email masqué pour l'affichage : « na•••@gmail.com ». On garde les deux
 * premiers caractères de la partie locale et le domaine entier (le chauffeur
 * doit reconnaître SA boîte, pas la deviner).
 */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  if (!domain) return '•••'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}•••@${domain}`
}

/** Peut-on renvoyer un code maintenant ? Renvoie les secondes à attendre (0 = oui). */
export function resendWaitSeconds(sentAt: Date | string | null, now = new Date()): number {
  if (!sentAt) return 0
  const elapsed = now.getTime() - new Date(sentAt).getTime()
  return Math.max(0, Math.ceil((SETUP_CODE_RESEND_DELAY_MS - elapsed) / 1000))
}

export type CodeCheck = 'ok' | 'none' | 'expired' | 'locked' | 'mismatch'

/**
 * Verdict d'une tentative. `matches` est calculé par l'appelant (comparaison
 * de hachés à temps constant) pour garder cette fonction sans crypto.
 */
export function checkCode(state: {
  hasCode: boolean
  expiresAt: Date | string | null
  attempts: number
  matches: boolean
}, now = new Date()): CodeCheck {
  if (!state.hasCode) return 'none'
  if (!state.expiresAt || new Date(state.expiresAt) < now) return 'expired'
  if (state.attempts >= SETUP_CODE_MAX_ATTEMPTS) return 'locked'
  return state.matches ? 'ok' : 'mismatch'
}
