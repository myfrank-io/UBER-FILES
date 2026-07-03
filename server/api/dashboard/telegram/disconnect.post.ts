import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { randomLinkCode } from '~/server/utils/telegram'

// Détache le compte Telegram du chauffeur (oublie l'identifiant de conversation)
// et régénère un code d'appairage neuf pour une future reconnexion.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  await prisma.driver.update({
    where: { id: driverId },
    data: { telegramChatId: null, telegramLinkCode: randomLinkCode() },
  })
  return { ok: true }
})
