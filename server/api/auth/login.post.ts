import { z } from 'zod'
import { prisma } from '~/server/utils/prisma'
import { verifyUserPassword } from '~/server/utils/password'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Identifiants invalides.' })
  }
  const user = await prisma.user.findUnique({ where: { email: body.data.email.toLowerCase() } })
  if (!user || !verifyUserPassword(body.data.password, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Email ou mot de passe incorrect.' })
  }

  await setUserSession(event, {
    user: { id: user.id, email: user.email, role: user.role, driverId: user.driverId },
  })

  return { ok: true, role: user.role }
})
