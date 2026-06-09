import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Saisie d'une indisponibilité (jour off, RDV perso, plage non travaillée).
const schema = z
  .object({
    title: z.string().max(120).optional(),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: 'La fin doit être postérieure au début.',
    path: ['endAt'],
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
  const created = await prisma.calendarEvent.create({
    data: {
      driverId,
      type: 'UNAVAILABILITY',
      source: 'INTERNAL',
      title: body.data.title ?? 'Indisponible',
      startAt: new Date(body.data.startAt),
      endAt: new Date(body.data.endAt),
    },
  })
  return { id: created.id }
})
