import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  searchPlaces,
  autocompleteEstablishments,
  resolveMapsShareUrl,
  type PlaceSummary,
} from '~/server/utils/google-maps'
import { placeQueryVariants, isLikelyUrl } from '~/lib/place-search'

// Recherche de la fiche d'établissement Google du chauffeur (pour connecter le
// lien « laisser un avis »). Proxy serveur : la clé Google reste cachée.
// Trois chemins, du plus précis au plus tolérant :
//  1. l'entrée est un lien de partage Google Maps → résolution directe ;
//  2. Text Search sur des variantes de la saisie (brute, premier segment avant
//     tiret, raison sociale) — les fiches « Nom - Slogan VTC » ratent sinon ;
//  3. repli autocomplétion (matching différent) pour les fiches en zone de
//     chalandise sans adresse visible.
const schema = z.object({ query: z.string().trim().min(2).max(500) })

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
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
  const query = body.data.query

  // Lien Google Maps collé tel quel (app Maps → Partager → Copier le lien).
  if (isLikelyUrl(query)) {
    return { results: await resolveMapsShareUrl(query, config.googleMapsApiKey) }
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { companyName: true },
  })
  const variants = placeQueryVariants(query, [driver?.companyName])

  const results: PlaceSummary[] = []
  const merge = (batch: PlaceSummary[]) => {
    for (const r of batch) {
      if (!results.some((x) => x.placeId === r.placeId)) results.push(r)
    }
  }

  for (const variant of variants) {
    merge(await searchPlaces(variant, config.googleMapsApiKey))
    if (results.length >= 5) break
  }
  if (results.length === 0) {
    for (const variant of variants) {
      merge(await autocompleteEstablishments(variant, config.googleMapsApiKey))
      if (results.length > 0) break
    }
  }
  return { results: results.slice(0, 8) }
})
