import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug : minuscules, chiffres et tirets.').optional(),
  phone: z.string().max(30).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  commissionBps: z.number().int().min(0).max(5000).optional(),
  monthlyFeeCents: z.number().int().min(0).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const driver = await prisma.driver.findUnique({ where: { id } })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors.map((e) => e.message).join(' ') })
  }

  const { monthlyFeeCents, ...driverData } = body.data

  // Vérifier l'unicité du slug si modifié
  if (driverData.slug && driverData.slug !== driver.slug) {
    const existing = await prisma.driver.findUnique({ where: { slug: driverData.slug } })
    if (existing) throw createError({ statusCode: 409, statusMessage: 'Ce slug est déjà utilisé.' })
  }

  await prisma.$transaction(async (tx) => {
    await tx.driver.update({ where: { id }, data: driverData })
    if (monthlyFeeCents !== undefined) {
      await tx.subscription.upsert({
        where: { driverId: id },
        create: { driverId: id, monthlyFeeCents, planName: 'Standard' },
        update: { monthlyFeeCents },
      })
    }
  })

  return { ok: true }
})
