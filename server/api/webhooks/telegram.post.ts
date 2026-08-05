import { prisma } from '~/server/utils/prisma'
import {
  answerCallbackQuery,
  arriveAckMessage,
  departAckMessage,
  liveLocationAckMessage,
  pickupAckMessage,
  sendTelegramMessage,
} from '~/server/utils/telegram'
import { acceptQuote, rejectQuote } from '~/server/utils/quote-actions'
import { applyRideProgress, ingestDriverPosition } from '~/server/utils/tracking'

// Webhook du bot Telegram. Sécurisé par l'en-tête secret de Telegram. Gère :
//  - l'appairage chauffeur via /start <code>
//  - la validation/refus d'un devis depuis les boutons inline
//  - le suivi de course : étapes « je pars / sur place / à bord » (boutons
//    inline) et ingestion de la position en direct partagée par le chauffeur
//    (message.location initial puis éditions successives du même message)
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

  // Position en direct : le partage initial arrive en `message.location`
  // (live_period), puis chaque mise à jour édite ce message (`edited_message`).
  // Une position statique classique est acceptée aussi (mieux que rien).
  const located = update.message?.location ? update.message : update.edited_message
  if (located?.location) {
    const chatId = String(located.chat.id)
    const driver = await prisma.driver.findFirst({ where: { telegramChatId: chatId } })
    if (driver) {
      const res = await ingestDriverPosition(driver.id, {
        lat: located.location.latitude,
        lng: located.location.longitude,
        heading: located.location.heading ?? null,
      })
      // Accusé uniquement au premier message (jamais sur les éditions, qui
      // arrivent toutes les ~10-30 s) et seulement si une course est suivie.
      if (res.tracked && update.message?.location) {
        await sendTelegramMessage(chatId, liveLocationAckMessage().text)
      }
    }
    return { ok: true }
  }

  // Boutons inline : "quote:accept:<id>" | "quote:reject:<id>"
  //                  "track:depart:<id>" | "track:arrive:<id>" | "track:pickup:<id>"
  const cb = update.callback_query
  if (cb?.data) {
    const [scope, action, refId] = cb.data.split(':')
    const chatId = String(cb.message?.chat.id ?? '')
    const driver = await prisma.driver.findFirst({ where: { telegramChatId: chatId } })
    if (scope === 'quote' && driver && refId) {
      try {
        if (action === 'accept') {
          // Même logique que le dashboard : règlement sur place → course confirmée
          // directement ; paiement en ligne → devis envoyé avec lien de paiement.
          const res = await acceptQuote(refId, driver.id)
          if (res.confirmed) {
            await answerCallbackQuery(cb.id, 'Course confirmée.')
            await sendTelegramMessage(chatId, '✅ Course confirmée — règlement sur place. Le client a été prévenu par email.')
          } else {
            await answerCallbackQuery(cb.id, 'Devis validé et envoyé au client.')
            await sendTelegramMessage(chatId, `✅ Devis validé (${((res.amountCents ?? 0) / 100).toFixed(2)} €). Le client a reçu le lien de paiement.`)
          }
        } else if (action === 'reject') {
          await rejectQuote(refId, driver.id)
          await answerCallbackQuery(cb.id, 'Devis refusé.')
          await sendTelegramMessage(chatId, '❌ Devis refusé.')
        }
      } catch (e) {
        await answerCallbackQuery(cb.id, (e as { statusMessage?: string }).statusMessage ?? 'Action impossible.')
      }
    } else if (scope === 'track' && driver && refId) {
      try {
        if (action === 'depart') {
          const res = await applyRideProgress(refId, driver.id, 'depart')
          await answerCallbackQuery(cb.id, res.already ? 'Départ déjà signalé.' : 'Le client est prévenu 🚗')
          if (!res.already) {
            const msg = departAckMessage({
              customerName: res.booking.quote.rideRequest.customerName,
              bookingId: res.booking.id,
            })
            await sendTelegramMessage(chatId, msg.text, msg.buttons)
          }
        } else if (action === 'arrive') {
          const res = await applyRideProgress(refId, driver.id, 'arrive')
          await answerCallbackQuery(cb.id, res.already ? 'Déjà signalé.' : 'Arrivée signalée 🅿️')
          if (!res.already) {
            const msg = arriveAckMessage({ bookingId: res.booking.id })
            await sendTelegramMessage(chatId, msg.text, msg.buttons)
          }
        } else if (action === 'pickup') {
          const res = await applyRideProgress(refId, driver.id, 'pickup')
          await answerCallbackQuery(cb.id, res.already ? 'Déjà signalé.' : 'Client à bord 🧍')
          if (!res.already) {
            await sendTelegramMessage(chatId, pickupAckMessage().text)
          }
        }
      } catch (e) {
        await answerCallbackQuery(cb.id, (e as { statusMessage?: string }).statusMessage ?? 'Action impossible.')
      }
    }
    return { ok: true }
  }

  return { ok: true }
})

interface TelegramLocation {
  latitude: number
  longitude: number
  // Présents sur les partages « position en direct ».
  live_period?: number
  heading?: number
}

interface TelegramMessage {
  text?: string
  chat: { id: number }
  location?: TelegramLocation
}

interface TelegramUpdate {
  message?: TelegramMessage
  // Mises à jour de la position en direct (éditions du message de partage).
  edited_message?: TelegramMessage
  callback_query?: {
    id: string
    data?: string
    message?: { chat: { id: number } }
  }
}
