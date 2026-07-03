// Bot Telegram : notifications chauffeur temps réel + validation/ajustement du devis
// via boutons inline. Sans token, on journalise simplement (dev/test).
import { randomBytes } from 'node:crypto'
import { formatMoney } from '~/lib/money'

/** Code d'appairage à usage unique (lien /start du bot). */
export function randomLinkCode(): string {
  return randomBytes(6).toString('hex')
}

/** Lien profond ouvrant la conversation du bot avec le code pré-rempli. */
export function telegramDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=${code}`
}

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

export interface InlineButton {
  text: string
  callback_data: string
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  buttons?: InlineButton[][],
): Promise<{ sent: boolean }> {
  const config = useRuntimeConfig()
  if (!config.telegramBotToken) {
    console.info(`[telegram:dev] → ${chatId}: ${text.slice(0, 80)}…`)
    return { sent: false }
  }
  const res = await fetch(API(config.telegramBotToken, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    }),
  })
  return { sent: res.ok }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  const config = useRuntimeConfig()
  if (!config.telegramBotToken) return
  await fetch(API(config.telegramBotToken, 'answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  })
}

/**
 * Notifie le chauffeur d'une nouvelle demande, avec boutons valider / refuser.
 * En paiement immédiat (`autoSent`), le devis est déjà parti : message informatif
 * sans boutons — la course se confirmera d'elle-même au paiement du client.
 */
export function newRequestMessage(opts: {
  customerName: string
  type: 'TRANSFER' | 'HOURLY'
  scheduledAt: Date
  amountCents: number
  currency: string
  pickupAddress?: string | null
  dropoffAddress?: string | null
  durationHours?: number | null
  quoteId: string
  hasConflict: boolean
  autoSent?: boolean
}): { text: string; buttons: InlineButton[][] } {
  const lines = [
    `🚗 <b>Nouvelle demande</b>`,
    `Client : ${opts.customerName}`,
    `Quand : ${opts.scheduledAt.toLocaleString('fr-FR')}`,
  ]
  if (opts.type === 'TRANSFER') {
    lines.push(`Trajet : ${opts.pickupAddress ?? '?'} → ${opts.dropoffAddress ?? '?'}`)
  } else {
    lines.push(`Mise à disposition : ${opts.durationHours} h`)
    if (opts.pickupAddress) lines.push(`Départ : ${opts.pickupAddress}`)
  }
  lines.push(`Prix calculé : <b>${formatMoney(opts.amountCents, opts.currency)}</b>`)
  if (opts.hasConflict) lines.push(`⚠️ <b>Conflit calendrier détecté</b>`)
  if (opts.autoSent) lines.push(`💳 Devis envoyé automatiquement — en attente du paiement du client.`)

  return {
    text: lines.join('\n'),
    buttons: opts.autoSent
      ? []
      : [
          [
            { text: '✅ Valider', callback_data: `quote:accept:${opts.quoteId}` },
            { text: '❌ Refuser', callback_data: `quote:reject:${opts.quoteId}` },
          ],
        ],
  }
}
