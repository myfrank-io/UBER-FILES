import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  make: z.string().min(1).max(60),
  modelFamily: z.string().min(1).max(80),
  modelLabel: z.string().min(1).max(120),
  vehicleClass: z.string().max(60).optional().nullable(),
  seats: z.number().int().min(1).max(20).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  isPrimary: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const data = body.data

  const count = await prisma.vehicle.count({ where: { driverId } })
  // Le tout premier véhicule devient automatiquement le véhicule mis en avant.
  const makePrimary = data.isPrimary || count === 0

  const vehicle = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.vehicle.updateMany({ where: { driverId }, data: { isPrimary: false } })
    }
    return tx.vehicle.create({
      data: {
        driverId,
        make: data.make,
        modelFamily: data.modelFamily,
        modelLabel: data.modelLabel,
        vehicleClass: data.vehicleClass ?? null,
        seats: data.seats ?? null,
        color: data.color ?? null,
        isPrimary: makePrimary,
        position: count,
      },
    })
  })

  return vehicle
})
