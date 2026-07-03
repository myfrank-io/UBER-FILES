import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { randomLinkCode, telegramDeepLink } from '~/server/utils/telegram'

// Démarre (ou relance) l'appairage Telegram du chauffeur connecté : régénère un
// code d'appairage neuf (à usage unique) et renvoie le lien profond du bot.
// Régénérer à chaque ouverture rend inutile un ancien lien qui aurait fuité.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const config = useRuntimeConfig()
  if (!config.telegramBotUsername) {
    throw createError({ statusCode: 503, statusMessage: 'Bot Telegram non configuré.' })
  }

  const code = randomLinkCode()
  await prisma.driver.update({
    where: { id: driverId },
    data: { telegramLinkCode: code },
  })

  return {
    botUsername: config.telegramBotUsername.replace(/^@/, ''),
    deepLink: telegramDeepLink(config.telegramBotUsername, code),
  }
})
