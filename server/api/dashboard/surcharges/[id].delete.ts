import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.surcharge.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Supplément introuvable.' })
  }

  await prisma.surcharge.delete({ where: { id } })
  return { ok: true }
})
