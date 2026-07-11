import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Tarif de mise à disposition, remplacé d'un bloc : tarif horaire de base et,
// en option, tarif réduit au-delà d'un seuil d'heures. `enabled: false` retire
// la mise à disposition de la page publique.
const schema = z
  .discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      pricePerHourCents: z.number().int().min(1),
      overtimeAfterHours: z.number().int().min(1).max(23).nullable(),
      overtimeRateCents: z.number().int().min(1).nullable(),
    }),
  ])
  .refine(
    (d) => !d.enabled || (d.overtimeAfterHours == null) === (d.overtimeRateCents == null),
    { message: 'Renseignez à la fois le seuil et le tarif des heures supplémentaires.' },
  )

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const data = body.data.enabled
    ? {
        hourlyRateCents: body.data.pricePerHourCents,
        hourlyOvertimeAfterHours: body.data.overtimeAfterHours,
        hourlyOvertimeRateCents: body.data.overtimeRateCents,
      }
    : { hourlyRateCents: null, hourlyOvertimeAfterHours: null, hourlyOvertimeRateCents: null }

  const driver = await prisma.driver.update({ where: { id: driverId }, data })

  return {
    hourlyRateCents: driver.hourlyRateCents,
    hourlyOvertimeAfterHours: driver.hourlyOvertimeAfterHours,
    hourlyOvertimeRateCents: driver.hourlyOvertimeRateCents,
  }
})
