import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  tagline: z.string().max(200).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  // Accepte une URL http(s) classique OU une image importée depuis l'appareil,
  // encodée en data URL (data:image/...;base64,…). ~8 Mo de marge en base64.
  photoUrl: z
    .string()
    .max(8_000_000)
    .refine(
      (v) => /^https?:\/\//i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
      'Photo invalide.',
    )
    .optional()
    .nullable(),
  vehicleMake: z.string().max(60).optional().nullable(),
  vehicleModel: z.string().max(60).optional().nullable(),
  vehicleClass: z.string().max(60).optional().nullable(),
  vehicleSeats: z.number().int().min(1).max(20).optional().nullable(),
  services: z.string().max(1000).optional().nullable(),
  serviceArea: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
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

  const driver = await prisma.driver.update({
    where: { id: driverId },
    data: body.data,
  })

  return { ok: true, displayName: driver.displayName }
})
