import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '~/server/utils/prisma'
import { sendEmail, emailTemplates } from '~/server/utils/email'

const schema = z.object({
  email: z.string().email(),
})

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Email invalide.' })
  }

  const user = await prisma.user.findUnique({
    where: { email: body.data.email.toLowerCase() },
  })

  // Réponse identique que l'email existe ou non (évite l'énumération des comptes)
  if (!user) {
    return { ok: true }
  }

  const token = randomBytes(32).toString('hex')
  const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 heure

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpiry: expiry },
  })

  const resetUrl = `${config.public.appBaseUrl}/auth/reset-password?token=${token}`
  const tpl = emailTemplates.passwordReset({ resetUrl })
  await sendEmail({ to: user.email, ...tpl })

  return { ok: true }
})
