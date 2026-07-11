import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { searchPlaces, autocompleteEstablishments } from '~/server/utils/google-maps'

// Recherche de la fiche d'établissement Google du chauffeur (nom + ville) pour
// connecter le lien « laisser un avis ». Proxy serveur : la clé Google reste cachée.
const schema = z.object({ query: z.string().trim().min(2).max(200) })

export default defineEventHandler(async (event) => {
  await requireDriverId(event)
  const config = useRuntimeConfig()
  if (!config.googleMapsApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Recherche Google indisponible pour le moment.',
    })
  }
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Recherche invalide.' })
  }
  let results = await searchPlaces(body.data.query, config.googleMapsApiKey)
  // Les fiches « zone de chalandise » (sans adresse visible) échappent parfois
  // à Text Search : l'autocomplétion, au matching différent, sert de second
  // filet avant de conclure « aucun établissement trouvé ».
  if (results.length === 0) {
    results = await autocompleteEstablishments(body.data.query, config.googleMapsApiKey)
  }
  return { results }
})
