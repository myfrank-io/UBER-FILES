import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Liste des véhicules du chauffeur connecté (mis en avant en premier).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const [driver, rows] = await Promise.all([
    prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { slug: true } }),
    prisma.vehicle.findMany({
      where: { driverId },
      orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
    }),
  ])
  // Le blob base64 (photoUrl) ne sort jamais en JSON : on expose une URL d'image
  // versionnée par updatedAt (cache immuable côté navigateur/CDN).
  const vehicles = rows.map(({ photoUrl, ...v }) => ({
    ...v,
    photoSrc: photoUrl
      ? `/api/public/${driver.slug}/vehicles/${v.id}/photo?v=${v.updatedAt.getTime()}`
      : null,
  }))
  return { vehicles }
})
