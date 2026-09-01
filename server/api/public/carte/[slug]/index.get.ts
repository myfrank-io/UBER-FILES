import { prisma } from '~/server/utils/prisma'
import { loadPublishedCard, cardImageUrl, serializeBlock } from '~/server/utils/card'
import { publicPhotoUrl } from '~/server/utils/driver'
import { driverReviewUrl } from '~/lib/review-link'
import { cardTheme } from '~/lib/card-blocks'

// Carte de visite publique d'un chauffeur. Mêmes conventions de cache que la
// page publique de réservation : cache CDN court + revalidation en arrière-plan,
// pour ne payer ni le démarrage serverless ni le SQL à chaque visite.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!

  const loaded = await loadPublishedCard(slug)
  if (!loaded) {
    throw createError({ statusCode: 404, statusMessage: 'Carte introuvable.' })
  }
  const { driver, profile } = loaded

  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  const hasReviewLink = Boolean(
    driverReviewUrl({ reviewUrl: driver.reviewUrl, googlePlaceId: driver.googlePlaceId }),
  )

  // Un bouton « Laisser un avis » sans dépôt configuré n'aurait nulle part où
  // mener : on le retire plutôt que d'afficher un cul-de-sac.
  const blocks = profile.blocks
    .filter((b) => b.kind !== 'REVIEW_CTA' || hasReviewLink)
    .map(serializeBlock)

  // La vitrine véhicules réutilise les photos déjà importées : aucune image en
  // double, et le blob base64 ne sort jamais en JSON.
  const wantsVehicles = blocks.some((b) => b.kind === 'VEHICLES')
  let vehicles: {
    id: string
    label: string
    vehicleClass: string | null
    seats: number | null
    photoSrc: string | null
  }[] = []

  if (wantsVehicles) {
    const [rows, withPhoto] = await Promise.all([
      prisma.vehicle.findMany({
        where: { driverId: driver.id },
        orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          modelLabel: true,
          vehicleClass: true,
          seats: true,
          updatedAt: true,
        },
      }),
      prisma.vehicle.findMany({
        where: { driverId: driver.id, photoUrl: { not: null } },
        select: { id: true },
      }),
    ])
    const photoIds = new Set(withPhoto.map((v) => v.id))
    vehicles = rows.map((v) => ({
      id: v.id,
      label: v.modelLabel,
      vehicleClass: v.vehicleClass,
      seats: v.seats,
      photoSrc: photoIds.has(v.id)
        ? `/api/public/${driver.slug}/vehicles/${v.id}/photo?v=${v.updatedAt.getTime()}`
        : null,
    }))
  }

  const photoCount = await prisma.driver.count({
    where: { id: driver.id, photoUrl: { not: null } },
  })

  return {
    slug: driver.slug,
    displayName: driver.displayName,
    headline: profile.headline ?? driver.tagline,
    company: profile.company,
    theme: cardTheme(profile.theme).key,
    // Avatar de la carte s'il a été importé, sinon la photo de profil du
    // chauffeur — le chauffeur n'a rien à refaire.
    avatarUrl:
      cardImageUrl(driver.slug, profile.images, 'avatar')
      ?? publicPhotoUrl(driver, photoCount > 0),
    coverUrl: cardImageUrl(driver.slug, profile.images, 'cover'),
    hasContactCard: Boolean(driver.phone || driver.contactEmail),
    blocks,
    vehicles,
  }
})
