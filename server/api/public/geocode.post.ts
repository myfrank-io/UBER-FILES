import { z } from 'zod'
import { geocodeAddress } from '~/server/utils/google-maps'

// Géocode une adresse libre → coordonnées (Google si clé, sinon Nominatim).
const schema = z.object({ address: z.string().min(3).max(300) })

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Adresse invalide.' })
  }
  const result = await geocodeAddress(body.data.address, config.googleMapsApiKey || undefined)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Adresse introuvable.' })
  }
  return result
})
