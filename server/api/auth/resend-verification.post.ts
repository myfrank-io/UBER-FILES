import { requireUser } from '~/server/utils/auth'
import { resendVerificationEmail } from '~/server/utils/email-verification'

// Renvoie le lien de confirmation d'email à l'utilisateur connecté (bouton de la
// bannière « confirmez votre email »). Throttlé, no-op si déjà vérifié.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const result = await resendVerificationEmail(user.id)

  if (result === 'THROTTLED') {
    throw createError({
      statusCode: 429,
      statusMessage: 'Un email vient d’être envoyé. Patientez une minute avant de réessayer.',
    })
  }

  return { ok: true, alreadyVerified: result === 'ALREADY_VERIFIED' }
})
