import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Grille des transferts aéroport, remplacée d'un bloc : 4 forfaits Paris
// intra-muros (Orly/Roissy × rive droite/gauche, valables dans les deux sens)
// + prix au km hors Paris. null = trajet non proposé ; tout à null = l'onglet
// Aéroport disparaît de la page publique.
const priceCents = z.number().int().min(1).max(1_000_000).nullable()

const schema = z.object({
  orlyRiveDroiteCents: priceCents,
  orlyRiveGaucheCents: priceCents,
  cdgRiveDroiteCents: priceCents,
  cdgRiveGaucheCents: priceCents,
  kmRateCents: priceCents,
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
      airportOrlyRiveDroiteCents: body.data.orlyRiveDroiteCents,
      airportOrlyRiveGaucheCents: body.data.orlyRiveGaucheCents,
      airportCdgRiveDroiteCents: body.data.cdgRiveDroiteCents,
      airportCdgRiveGaucheCents: body.data.cdgRiveGaucheCents,
      airportKmRateCents: body.data.kmRateCents,
    },
  })

  return {
    airportOrlyRiveDroiteCents: driver.airportOrlyRiveDroiteCents,
    airportOrlyRiveGaucheCents: driver.airportOrlyRiveGaucheCents,
    airportCdgRiveDroiteCents: driver.airportCdgRiveDroiteCents,
    airportCdgRiveGaucheCents: driver.airportCdgRiveGaucheCents,
    airportKmRateCents: driver.airportKmRateCents,
  }
})
