import { z } from 'zod'
import { requireUser } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { hashUserPassword } from '~/server/utils/password'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { confirmSetupStep, isSetupSession } from '~/server/utils/setup'

// Choix du mot de passe depuis le parcours. Réservé aux sessions ouvertes par
// le lien de configuration : posséder ce lien (généré par l'admin, envoyé au
// chauffeur) équivaut au lien d'invitation, qui permet déjà de définir le mot
// de passe. Une session ouverte par login classique n'y a pas accès — le
// chauffeur connaît alors son mot de passe et passe par « mot de passe oublié ».
const schema = z.object({
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(200),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (user.role !== 'DRIVER' || !user.driverId) {
    throw createError({ statusCode: 403, statusMessage: 'Accès réservé aux chauffeurs.' })
  }
  if (!(await isSetupSession(event))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cette action n’est possible que depuis votre lien de configuration.',
    })
  }
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors[0]?.message ?? 'Mot de passe invalide.',
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashUserPassword(body.data.password),
      // L'invitation est consommée : le lien « définir mon mot de passe » ne
      // doit plus fonctionner.
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
  })
  const confirmed = await confirmSetupStep(user.driverId, 'acces')

  // Même notification de sécurité que le reset classique. Jamais bloquante.
  const config = useRuntimeConfig()
  try {
    await sendEmail({
      to: user.email,
      ...emailTemplates.passwordChanged({
        loginUrl: `${config.public.appBaseUrl}/dashboard/login`,
        supportEmail: config.public.supportEmail || null,
      }),
    })
  } catch (err) {
    console.error('[setup/password] échec email de confirmation', err)
  }

  return { ok: true, confirmed }
})
