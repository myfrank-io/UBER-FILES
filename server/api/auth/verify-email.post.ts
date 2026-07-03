import { z } from 'zod'
import { prisma } from '~/server/utils/prisma'

// Confirme l'adresse email d'un compte à partir du jeton reçu par email.
// Usage unique (le jeton est effacé) + expiration (7 jours).
const schema = z.object({
  token: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Lien invalide.' })
  }

  const user = await prisma.user.findUnique({
    where: { emailVerificationToken: body.data.token },
  })

  // Jeton inconnu : soit déjà utilisé (email confirmé), soit invalide. On répond
  // avec un statut « déjà confirmé » pour rester amical si le lien est cliqué 2×.
  if (!user) {
    throw createError({
      statusCode: 410,
      statusMessage: 'Ce lien a déjà été utilisé ou n’est plus valide.',
    })
  }

  if (!user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
    throw createError({
      statusCode: 410,
      statusMessage: 'Ce lien a expiré. Demandez-en un nouveau depuis votre espace.',
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    },
  })

  return { ok: true }
})
