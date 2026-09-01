import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { loadOrCreateCardProfile, isCardImageRole, dashboardCardImageUrl } from '~/server/utils/card'

// Import d'une image de carte (couverture ou avatar). L'image arrive déjà
// compressée par le navigateur (composables/useImageResize) en data URL ; on
// sépare ici le type MIME des octets pour que l'endpoint public n'ait plus qu'à
// décoder. ~3 Mo de marge en base64, soit largement au-delà d'une image 1200px.
const MAX_DATA_URL = 3_000_000

const schema = z.object({
  dataUrl: z
    .string()
    .max(MAX_DATA_URL, 'Image trop volumineuse.')
    .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i, 'Image invalide.'),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const role = getRouterParam(event, 'role')
  if (!isCardImageRole(role)) {
    throw createError({ statusCode: 404, statusMessage: 'Image inconnue.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const match = body.data.dataUrl.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/)
  if (!match) {
    throw createError({ statusCode: 400, statusMessage: 'Image invalide.' })
  }
  const mime = match[1]!.toLowerCase()
  const data = match[2]!.replace(/\s/g, '')

  // Le base64 doit être décodable : on refuse ici plutôt que de servir une
  // image cassée à chaque visiteur de la carte.
  const buffer = Buffer.from(data, 'base64')
  if (buffer.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Image invalide.' })
  }

  const profile = await loadOrCreateCardProfile(driverId)
  const image = await prisma.cardImage.upsert({
    where: { profileId_role: { profileId: profile.id, role } },
    create: { profileId: profile.id, role, data, mime },
    update: { data, mime },
    select: { role: true, updatedAt: true },
  })

  // URL d'éditeur : elle doit fonctionner même si la carte est en brouillon.
  return { ok: true, url: dashboardCardImageUrl([image], role) }
})
