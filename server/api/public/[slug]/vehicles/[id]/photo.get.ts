import { prisma } from '~/server/utils/prisma'

// Sert la photo personnelle d'un véhicule en vraie image HTTP (même mécanique
// que la photo de profil chauffeur) : le data URL base64 stocké en base est
// décodé une fois, puis mis en cache immuable — l'URL est versionnée par
// `?v=<updatedAt>` côté appelant, donc un changement de photo change d'URL.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const id = getRouterParam(event, 'id')!

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, driver: { slug, status: 'ACTIVE' } },
    select: { photoUrl: true },
  })
  if (!vehicle?.photoUrl) {
    throw createError({ statusCode: 404, statusMessage: 'Photo introuvable.' })
  }

  const match = vehicle.photoUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s)
  if (!match) {
    throw createError({ statusCode: 404, statusMessage: 'Photo invalide.' })
  }

  setResponseHeader(event, 'Content-Type', match[1]!)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return Buffer.from(match[2]!, 'base64')
})
