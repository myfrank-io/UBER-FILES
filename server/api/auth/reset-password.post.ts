import { z } from 'zod'
import { prisma } from '~/server/utils/prisma'
import { hashUserPassword } from '~/server/utils/password'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors[0]?.message ?? 'Données invalides.',
    })
  }

  const user = await prisma.user.findUnique({
    where: { passwordResetToken: body.data.token },
  })

  if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Lien invalide ou expiré. Veuillez refaire une demande.',
    })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashUserPassword(body.data.password),
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
  })

  return { ok: true }
})
