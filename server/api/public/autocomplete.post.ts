import { autocompleteSchema } from '~/server/utils/validation'
import { autocompletePlaces } from '~/server/utils/google-maps'

// Proxy d'autocomplétion d'adresses (la clé Google reste côté serveur).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readValidatedBody(event, (b) => autocompleteSchema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })
  }
  const predictions = await autocompletePlaces(
    body.data.input,
    config.googleMapsApiKey || undefined,
  )
  return { predictions }
})
