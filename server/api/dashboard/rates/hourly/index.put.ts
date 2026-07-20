import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Tarif de mise à disposition, remplacé d'un bloc : tarif horaire de base et,
// en option, tarif réduit au-delà d'un seuil d'heures, puis une seconde tranche
// au-delà d'un second seuil. `enabled: false` retire la mise à disposition de
// la page publique. Les champs de la seconde tranche sont `nullish` : un client
// antérieur à leur ajout peut encore enregistrer sans les envoyer.
const schema = z
  .discriminatedUnion('enabled', [
    z.object({ enabled: z.literal(false) }),
    z.object({
      enabled: z.literal(true),
      pricePerHourCents: z.number().int().min(1),
      overtimeAfterHours: z.number().int().min(1).max(23).nullable(),
      overtimeRateCents: z.number().int().min(1).nullable(),
      overtime2AfterHours: z.number().int().min(2).max(23).nullish(),
      overtime2RateCents: z.number().int().min(1).nullish(),
    }),
  ])
  .refine(
    (d) => !d.enabled || (d.overtimeAfterHours == null) === (d.overtimeRateCents == null),
    { message: 'Renseignez à la fois le seuil et le tarif des heures supplémentaires.' },
  )
  .refine(
    (d) => !d.enabled || (d.overtime2AfterHours == null) === (d.overtime2RateCents == null),
    { message: 'Renseignez à la fois le seuil et le tarif de la seconde tranche.' },
  )
  .refine(
    (d) => !d.enabled || d.overtime2AfterHours == null || d.overtimeAfterHours != null,
    { message: "La seconde tranche nécessite un tarif d'heure supplémentaire." },
  )
  .refine(
    (d) =>
      !d.enabled ||
      d.overtime2AfterHours == null ||
      d.overtimeAfterHours == null ||
      d.overtime2AfterHours > d.overtimeAfterHours,
    { message: 'Le seuil de la seconde tranche doit être supérieur au premier seuil.' },
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
        hourlyOvertime2AfterHours: body.data.overtime2AfterHours ?? null,
        hourlyOvertime2RateCents: body.data.overtime2RateCents ?? null,
      }
    : {
        hourlyRateCents: null,
        hourlyOvertimeAfterHours: null,
        hourlyOvertimeRateCents: null,
        hourlyOvertime2AfterHours: null,
        hourlyOvertime2RateCents: null,
      }

  const driver = await prisma.driver.update({ where: { id: driverId }, data })

  return {
    hourlyRateCents: driver.hourlyRateCents,
    hourlyOvertimeAfterHours: driver.hourlyOvertimeAfterHours,
    hourlyOvertimeRateCents: driver.hourlyOvertimeRateCents,
    hourlyOvertime2AfterHours: driver.hourlyOvertime2AfterHours,
    hourlyOvertime2RateCents: driver.hourlyOvertime2RateCents,
  }
})
