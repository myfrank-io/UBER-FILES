import { PrismaClient } from '@prisma/client'

// Les photos (data URL base64, ~50-100 Ko par ligne) ne sont JAMAIS rapatriées
// par défaut : chaque requête qui chargeait une ligne Driver/Vehicle complète
// transférait ces blobs depuis la base pour les jeter aussitôt. Les deux
// endpoints image (/api/public/…/photo) les récupèrent via un `select` explicite,
// qui prime sur cet `omit` global.
const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    omit: {
      driver: { photoUrl: true },
      vehicle: { photoUrl: true },
      // Images de la carte de visite : même règle, le blob n'est lu que par
      // l'endpoint image via un select explicite.
      cardImage: { data: true },
    },
  })

// Client Prisma en singleton (évite d'épuiser le pool de connexions en dev/HMR).
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
