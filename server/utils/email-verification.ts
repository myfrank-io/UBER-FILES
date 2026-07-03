import { randomBytes } from 'node:crypto'
import type { User } from '@prisma/client'
import { prisma } from './prisma'
import { sendEmail, emailTemplates } from './email'

// Vérification de l'adresse email d'un compte back-office : génération du jeton,
// envoi (ou renvoi) du lien de confirmation. Le jeton est à usage unique et
// expire au bout de 7 jours.

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours
// Anti-spam : intervalle minimum entre deux envois du lien de confirmation.
const RESEND_COOLDOWN_MS = 60 * 1000 // 1 minute

/**
 * Génère un nouveau jeton de vérification, l'enregistre sur le compte, et renvoie
 * l'URL de confirmation à insérer dans l'email.
 */
export async function issueVerificationToken(userId: string): Promise<string> {
  const config = useRuntimeConfig()
  const token = randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationToken: token,
      emailVerificationExpiry: new Date(Date.now() + TOKEN_TTL_MS),
      emailVerificationSentAt: new Date(),
    },
  })
  return `${config.public.appBaseUrl}/auth/verify-email?token=${token}`
}

/**
 * Envoi initial du lien de confirmation, à l'inscription (welcome + confirmation).
 * N'interrompt jamais l'inscription : un échec d'envoi est seulement journalisé.
 */
export async function sendInitialVerificationEmail(
  user: Pick<User, 'id' | 'email'>,
  displayName: string,
): Promise<void> {
  const config = useRuntimeConfig()
  try {
    const verifyUrl = await issueVerificationToken(user.id)
    await sendEmail({
      to: user.email,
      ...emailTemplates.verifyEmail({
        displayName,
        verifyUrl,
        dashboardUrl: `${config.public.appBaseUrl}/dashboard`,
      }),
    })
  } catch (err) {
    console.error('[email-verification] échec envoi initial', err)
  }
}

export type ResendResult = 'SENT' | 'ALREADY_VERIFIED' | 'THROTTLED'

/**
 * Renvoi du lien de confirmation (depuis la bannière de l'espace chauffeur).
 * Throttlé pour éviter le spam ; no-op si l'email est déjà vérifié.
 */
export async function resendVerificationEmail(userId: string): Promise<ResendResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return 'ALREADY_VERIFIED' // compte introuvable : réponse neutre
  if (user.emailVerified) return 'ALREADY_VERIFIED'

  if (
    user.emailVerificationSentAt &&
    Date.now() - user.emailVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return 'THROTTLED'
  }

  const verifyUrl = await issueVerificationToken(user.id)
  await sendEmail({
    to: user.email,
    ...emailTemplates.verifyEmailResend({ verifyUrl }),
  })
  return 'SENT'
}
