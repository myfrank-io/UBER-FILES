import { prisma } from '~/server/utils/prisma'

// ⚠️ OUTIL DE DÉVELOPPEMENT UNIQUEMENT — À RETIRER AVANT LA VERSION FINALE.
// Liste les pages publiques des chauffeurs pour le commutateur de dev.

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.public.devTools) {
    throw createError({ statusCode: 404, statusMessage: 'Not found.' })
  }

  const drivers = await prisma.driver.findMany({
    select: { slug: true, displayName: true, status: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })
  return { drivers }
})
