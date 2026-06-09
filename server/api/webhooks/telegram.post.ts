import { prisma } from '~/server/utils/prisma'
import { answerCallbackQuery, sendTelegramMessage } from '~/server/utils/telegram'
import { sendQuoteToClient, rejectQuote } from '~/server/utils/quote-actions'

// Webhook du bot Telegram. Sécurisé par l'en-tête secret de Telegram. Gère :
//  - l'appairage chauffeur via /start <code>
//  - la validation/refus d'un devis depuis les boutons inline
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secret = getHeader(event, 'x-telegram-bot-api-secret-token')
  if (config.telegramWebhookSecret && secret !== config.telegramWebhookSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Signature invalide.' })
  }

  const update = await readBody<TelegramUpdate>(event)

  // Appairage : /start <code>
  const text = update.message?.text
  if (text?.startsWith('/start')) {
    const code = text.split(' ')[1]
    const chatId = String(update.message!.chat.id)
    if (code) {
      const driver = await prisma.driver.findUnique({ where: { telegramLinkCode: code } })
      if (driver) {
        await prisma.driver.update({
          where: { id: driver.id },
          data: { telegramChatId: chatId, telegramLinkCode: null },
        })
        await sendTelegramMessage(chatId, '✅ Compte lié. Vous recevrez ici vos nouvelles demandes.')
        return { ok: true }
      }
    }
    await sendTelegramMessage(chatId, 'Bonjour ! Utilisez le lien fourni dans votre back-office pour lier votre compte.')
    return { ok: true }
  }

  // Boutons inline : "quote:accept:<id>" | "quote:reject:<id>"
  const cb = update.callback_query
  if (cb?.data) {
    const [scope, action, quoteId] = cb.data.split(':')
    const chatId = String(cb.message?.chat.id ?? '')
    const driver = await prisma.driver.findFirst({ where: { telegramChatId: chatId } })
    if (scope === 'quote' && driver && quoteId) {
      try {
        if (action === 'accept') {
          const res = await sendQuoteToClient(quoteId, driver.id)
          await answerCallbackQuery(cb.id, 'Devis validé et envoyé au client.')
          await sendTelegramMessage(chatId, `✅ Devis validé (${(res.amountCents / 100).toFixed(2)} €). Le client a reçu le lien de paiement.`)
        } else if (action === 'reject') {
          await rejectQuote(quoteId, driver.id)
          await answerCallbackQuery(cb.id, 'Devis refusé.')
          await sendTelegramMessage(chatId, '❌ Devis refusé.')
        }
      } catch (e) {
        await answerCallbackQuery(cb.id, (e as { statusMessage?: string }).statusMessage ?? 'Action impossible.')
      }
    }
    return { ok: true }
  }

  return { ok: true }
})

interface TelegramUpdate {
  message?: { text?: string; chat: { id: number } }
  callback_query?: {
    id: string
    data?: string
    message?: { chat: { id: number } }
  }
}
