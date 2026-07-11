import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { getPlaceSummary } from '~/server/utils/google-maps'

// Connecte la fiche Google choisie dans la recherche. Le placeId est revalidé
// via Place Details : on stocke le nom et l'adresse canoniques renvoyés par
// Google, jamais les libellés soumis par le navigateur. Modes exclusifs : la
// fiche connectée remplace un éventuel lien d'avis manuel.
const schema = z.object({ placeId: z.string().trim().min(1).max(400) })

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const config = useRuntimeConfig()
  if (!config.googleMapsApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Connexion Google indisponible pour le moment.',
    })
  }
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Fiche invalide.' })
  }

  const place = await getPlaceSummary(body.data.placeId, config.googleMapsApiKey)
  if (!place) {
    throw createError({ statusCode: 404, statusMessage: 'Fiche Google introuvable.' })
  }

  await prisma.driver.update({
    where: { id: driverId },
    data: {
      googlePlaceId: place.placeId,
      googlePlaceName: place.name,
      googlePlaceAddress: place.address,
      reviewUrl: null,
    },
  })
  return { ok: true, place }
})
