import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Liste des véhicules du chauffeur connecté (mis en avant en premier).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const vehicles = await prisma.vehicle.findMany({
    where: { driverId },
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
  })
  return { vehicles }
})
