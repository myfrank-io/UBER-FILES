import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Activation / suspension d'un compte chauffeur.
const schema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Statut invalide.' })

  await prisma.driver.update({ where: { id }, data: { status: body.data.status } })
  return { ok: true, status: body.data.status }
})
