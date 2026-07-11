import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  make: z.string().min(1).max(60).optional(),
  modelFamily: z.string().min(1).max(80).optional(),
  modelLabel: z.string().min(1).max(120).optional(),
  vehicleClass: z.string().max(60).optional().nullable(),
  seats: z.number().int().min(1).max(20).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  isPrimary: z.boolean().optional(),
  // Photo personnelle (data URL compressée côté client). null = retirer la photo.
  photoUrl: z
    .string()
    .max(8_000_000)
    .refine((v) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v), 'Photo invalide.')
    .optional()
    .nullable(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.vehicle.findUnique({ where: { id } })
  if (!existing || existing.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Véhicule introuvable.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const data = body.data

  const vehicle = await prisma.$transaction(async (tx) => {
    // Un seul véhicule peut être mis en avant à la fois.
    if (data.isPrimary === true) {
      await tx.vehicle.updateMany({ where: { driverId }, data: { isPrimary: false } })
    }
    return tx.vehicle.update({ where: { id }, data })
  })

  // Le blob base64 ne sort jamais en JSON (il est servi en vraie image HTTP).
  const { photoUrl: _photo, ...rest } = vehicle
  return rest
})
