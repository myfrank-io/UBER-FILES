import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Logo du design de cartes NFC, servi à l'admin pour l'aperçu. `logoData` est
// omis globalement du client Prisma : ce select explicite est, avec le
// générateur PDF, le seul endroit qui le rapatrie.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const design = await prisma.nfcCardDesign.findUnique({
    where: { driverId: id },
    select: { logoData: true, logoMime: true },
  })
  if (!design?.logoData || !design.logoMime) {
    throw createError({ statusCode: 404, statusMessage: 'Logo introuvable.' })
  }

  setResponseHeader(event, 'Content-Type', design.logoMime)
  // URL versionnée par updatedAt : cache navigateur privé, jamais partagé.
  setResponseHeader(event, 'Cache-Control', 'private, max-age=31536000, immutable')
  return Buffer.from(design.logoData, 'base64')
})
