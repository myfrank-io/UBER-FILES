import { prisma } from '~/server/utils/prisma'
import { z } from 'zod'

// ⚠️ OUTIL DE DÉVELOPPEMENT UNIQUEMENT — À RETIRER AVANT LA VERSION FINALE.
// Connexion en un clic en tant qu'admin ou chauffeur (pour basculer entre les espaces
// sans retaper les mots de passe). Désactivé en production sauf si DEV_TOOLS=1.

const schema = z.object({
  role: z.enum(['ADMIN', 'DRIVER']),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.public.devTools) {
    throw createError({ statusCode: 404, statusMessage: 'Not found.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Rôle invalide.' })
  }

  const user = await prisma.user.findFirst({
    where: { role: body.data.role },
    orderBy: { createdAt: 'asc' },
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: `Aucun compte ${body.data.role} en base.` })
  }

  await setUserSession(event, {
    user: { id: user.id, email: user.email, role: user.role, driverId: user.driverId },
  })

  return { ok: true, role: user.role, email: user.email }
})
