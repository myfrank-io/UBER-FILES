import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { isCardImageRole } from '~/server/utils/card'

// Images de la carte servies à SON PROPRIÉTAIRE, publiée ou non.
//
// L'endpoint public exige `published: true` — et c'est volontaire : son URL est
// mise en cache CDN de façon immuable, y servir une carte en brouillon la
// rendrait publiquement atteignable. Mais l'éditeur doit afficher ces images
// AVANT publication, état dans lequel se trouve tout chauffeur qui configure sa
// carte. D'où cette route parallèle, authentifiée et jamais mise en cache
// partagée (`private`).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const role = getRouterParam(event, 'role')
  if (!isCardImageRole(role)) {
    throw createError({ statusCode: 404, statusMessage: 'Image introuvable.' })
  }

  // `data` est exclu globalement du client Prisma : ce select explicite est le
  // seul endroit, avec l'endpoint public, qui le rapatrie.
  const image = await prisma.cardImage.findFirst({
    where: { role, profile: { driverId } },
    select: { data: true, mime: true },
  })
  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Image introuvable.' })
  }

  setResponseHeader(event, 'Content-Type', image.mime)
  // `private` : le cache du navigateur du chauffeur, jamais un cache partagé.
  // L'URL est versionnée par updatedAt, donc immuable sans risque de rémanence.
  setResponseHeader(event, 'Cache-Control', 'private, max-age=31536000, immutable')
  return Buffer.from(image.data, 'base64')
})
