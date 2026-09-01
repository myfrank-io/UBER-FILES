import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { loadOrCreateCardProfile, dashboardCardImageUrl, serializeBlock } from '~/server/utils/card'
import { publicPhotoUrl } from '~/server/utils/driver'
import { driverReviewUrl } from '~/lib/review-link'

// Carte de visite du chauffeur connecté. La carte est créée à la volée, déjà
// pré-remplie, lors du premier appel : le chauffeur ne voit jamais de page vide.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)

  const [profile, driver, photoCount] = await Promise.all([
    loadOrCreateCardProfile(driverId),
    prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      select: {
        slug: true,
        displayName: true,
        tagline: true,
        updatedAt: true,
        phone: true,
        contactEmail: true,
        reviewUrl: true,
        googlePlaceId: true,
      },
    }),
    prisma.driver.count({ where: { id: driverId, photoUrl: { not: null } } }),
  ])

  return {
    slug: driver.slug,
    displayName: driver.displayName,
    published: profile.published,
    publishedAt: profile.publishedAt,
    theme: profile.theme,
    headline: profile.headline,
    company: profile.company,
    // Photo de profil du chauffeur : sert d'avatar par défaut si aucun avatar
    // spécifique n'a été importé pour la carte.
    profilePhotoUrl: publicPhotoUrl(driver, photoCount > 0),
    // URL d'éditeur (authentifiées) : les images doivent s'afficher AVANT
    // publication, ce que la route publique refuse par conception.
    coverUrl: dashboardCardImageUrl(profile.images, 'cover'),
    avatarUrl: dashboardCardImageUrl(profile.images, 'avatar'),
    logoUrl: dashboardCardImageUrl(profile.images, 'logo'),
    logoPlate: profile.logoPlate,
    // Le bouton « Ajouter à mes contacts » n'apparaît que s'il y a de quoi
    // remplir une fiche ; l'aperçu doit le refléter.
    hasContactCard: Boolean(driver.phone || driver.contactEmail),
    // Un bloc « Laisser un avis » sans dépôt configuré est masqué côté public :
    // l'éditeur le signale plutôt que de laisser une surprise.
    hasReviewLink: Boolean(
      driverReviewUrl({ reviewUrl: driver.reviewUrl, googlePlaceId: driver.googlePlaceId }),
    ),
    blocks: profile.blocks.map(serializeBlock),
  }
})
