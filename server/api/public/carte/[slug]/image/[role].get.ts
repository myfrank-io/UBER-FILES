import { prisma } from '~/server/utils/prisma'
import { isCardImageRole } from '~/server/utils/card'

// Sert une image de carte (couverture / avatar) en vraie image HTTP. Le data
// URL base64 stocké en base est décodé ici puis mis en cache immuable : l'URL
// est versionnée par `?v=<updatedAt>`, donc changer l'image change son adresse.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const role = getRouterParam(event, 'role')
  if (!isCardImageRole(role)) {
    throw createError({ statusCode: 404, statusMessage: 'Image introuvable.' })
  }

  // `data` est exclu globalement du client Prisma : ce select explicite est le
  // seul endroit qui le rapatrie.
  const image = await prisma.cardImage.findFirst({
    where: {
      role,
      profile: { published: true, driver: { slug, status: 'ACTIVE' } },
    },
    select: { data: true, mime: true },
  })
  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Image introuvable.' })
  }

  setResponseHeader(event, 'Content-Type', image.mime)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return Buffer.from(image.data, 'base64')
})
