import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// État d'appairage Telegram du chauffeur connecté. Interrogé en boucle par la
// page de réglages pendant l'appairage (bascule en « connecté » sans rechargement).
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    select: { telegramChatId: true },
  })
  return { linked: Boolean(driver.telegramChatId) }
})
