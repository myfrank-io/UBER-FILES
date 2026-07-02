import { prisma } from '~/server/utils/prisma'

// Sert la photo de profil du chauffeur en vraie image HTTP.
// La photo est stockée en data URL (base64) dans Driver.photoUrl : l'embarquer
// telle quelle dans les réponses JSON et le HTML SSR alourdissait chaque
// chargement de page de plusieurs centaines de Ko. Ici on la décode une fois et
// on laisse le navigateur + le CDN la mettre en cache de façon immuable — l'URL
// est versionnée par `?v=<updatedAt>` côté appelant, donc un changement de photo
// change d'URL.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await prisma.driver.findUnique({
    where: { slug },
    select: { photoUrl: true },
  })
  if (!driver?.photoUrl) {
    throw createError({ statusCode: 404, statusMessage: 'Photo introuvable.' })
  }

  // Ancienne photo hébergée ailleurs (URL http) : on redirige simplement.
  if (/^https?:\/\//i.test(driver.photoUrl)) {
    return sendRedirect(event, driver.photoUrl, 302)
  }

  const match = driver.photoUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s)
  if (!match) {
    throw createError({ statusCode: 404, statusMessage: 'Photo invalide.' })
  }

  setResponseHeader(event, 'Content-Type', match[1]!)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return Buffer.from(match[2]!, 'base64')
})
