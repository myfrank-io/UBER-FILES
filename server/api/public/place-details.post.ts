import { z } from 'zod'
import { geocodePlace } from '~/server/utils/google-maps'

// Résout un placeId (choisi dans l'autocomplétion) en coordonnées EXACTES via
// Place Details. C'est la précision « au bon terminal / bonne entrée » — bien
// meilleure que de re-géocoder le texte de l'adresse. Sans clé Google (repli BAN),
// les coordonnées sont déjà fournies par l'autocomplétion, donc pas d'appel ici.
const schema = z.object({ placeId: z.string().min(1).max(400) })

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'placeId requis.' })
  }
  const coords = await geocodePlace(body.data.placeId, config.googleMapsApiKey || undefined)
  if (!coords) {
    throw createError({ statusCode: 404, statusMessage: 'Lieu introuvable.' })
  }
  return coords
})
