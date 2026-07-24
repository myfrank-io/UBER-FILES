import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Supplément selon le nombre de personnes : deux montants cumulatifs (3e et 4e
// personne), remplacés d'un bloc. Chaque champ vide (null) = pas de supplément
// pour cette personne. Tout vide = le sélecteur de nombre de personnes disparaît
// de la page publique. Le montant de la 4e personne s'ajoute EN PLUS de celui de
// la 3e (4 pers. = supplément 3e + supplément 4e).
const schema = z.object({
  thirdPassengerCents: z.number().int().min(1).nullable(),
  fourthPassengerCents: z.number().int().min(1).nullable(),
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
    data: {
      passengerSurcharge3Cents: body.data.thirdPassengerCents,
      passengerSurcharge4Cents: body.data.fourthPassengerCents,
    },
  })

  return {
    passengerSurcharge3Cents: driver.passengerSurcharge3Cents,
    passengerSurcharge4Cents: driver.passengerSurcharge4Cents,
  }
})
