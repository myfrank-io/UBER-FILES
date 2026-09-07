// Bot Telegram : notifications chauffeur temps réel + validation/ajustement du devis
// via boutons inline. Sans token, on journalise simplement (dev/test).
import { randomBytes } from 'node:crypto'
import { formatMoney } from '~/lib/money'
import { formatRideDateTime } from '~/lib/datetime'

/** Code d'appairage à usage unique (lien /start du bot). */
export function randomLinkCode(): string {
  return randomBytes(6).toString('hex')
}

/** Lien profond ouvrant la conversation du bot avec le code pré-rempli. */
export function telegramDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=${code}`
}

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

// Bouton inline : action (callback_data) ou lien externe (url), au choix.
export interface InlineButton {
  text: string
  callback_data?: string
  url?: string
}

/** Prénom du chauffeur pour saluer : premier mot du nom d'affichage. */
export function driverFirstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0]?.replace(/[—–,]+$/, '') || displayName
}

// Chaque message chauffeur commence par « Hello (prénom) 👋 ».
const hello = (displayName: string) => `Hello ${escHtml(driverFirstName(displayName))} 👋`

// Échappement HTML minimal pour parse_mode HTML (les saisies client y passent).
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
  driverDisplayName: string
  customerName: string
  type: 'TRANSFER' | 'HOURLY'
  scheduledAt: Date
  timezone: string
  amountCents: number
  currency: string
  pickupAddress?: string | null
  dropoffAddress?: string | null
  durationHours?: number | null
  // Transfert aéroport : trajet en clair (« Orly → Rive gauche ») + n° de vol.
  airportLabel?: string | null
  flightNumber?: string | null
  quoteId: string
  hasConflict: boolean
  autoSent?: boolean
}): { text: string; buttons: InlineButton[][] } {
  const lines = [
    hello(opts.driverDisplayName),
    `🚗 <b>Nouvelle demande</b>`,
    `Client : ${escHtml(opts.customerName)}`,
    `Quand : ${formatRideDateTime(opts.scheduledAt, opts.timezone)}`,
  ]
  if (opts.airportLabel) {
    lines.push(
      `✈️ <b>Transfert aéroport — ${escHtml(opts.airportLabel)}</b>${opts.flightNumber ? ` · vol ${escHtml(opts.flightNumber)}` : ''}`,
    )
  }
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

/**
 * Notifie le chauffeur qu'une course vient d'être confirmée (paiement en ligne
 * reçu, ou réservation avec règlement sur place) — y compris dans les flux sans
 * validation manuelle (paiement immédiat, confirmation automatique).
 */
export function bookingConfirmedMessage(opts: {
  driverDisplayName: string
  customerName: string
  customerPhone?: string | null
  scheduledAt: Date
  timezone: string
  type?: 'TRANSFER' | 'HOURLY'
  durationHours?: number | null
  pickupAddress?: string | null
  dropoffAddress?: string | null
  amountCents: number
  currency: string
  // true : payée en ligne ; false : à encaisser sur place (methodLabel précise le moyen)
  paidOnline: boolean
  methodLabel?: string
  conflictWarning?: boolean
}): { text: string } {
  const paiement = opts.paidOnline
    ? `💳 <b>${formatMoney(opts.amountCents, opts.currency)}</b> payés en ligne`
    : `💶 <b>${formatMoney(opts.amountCents, opts.currency)}</b> à encaisser sur place${opts.methodLabel ? ` (${opts.methodLabel})` : ''}`
  const lines = [
    hello(opts.driverDisplayName),
    `✅ <b>Course confirmée</b>`,
    `Client : ${escHtml(opts.customerName)}${opts.customerPhone ? ` — 📞 ${escHtml(opts.customerPhone)}` : ''}`,
    `Quand : ${formatRideDateTime(opts.scheduledAt, opts.timezone)}`,
  ]
  if (opts.type === 'TRANSFER') {
    lines.push(`Trajet : ${escHtml(opts.pickupAddress ?? '?')} → ${escHtml(opts.dropoffAddress ?? '?')}`)
  } else if (opts.type === 'HOURLY') {
    lines.push(`Mise à disposition : ${opts.durationHours ?? '?'} h`)
    if (opts.pickupAddress) lines.push(`Départ : ${escHtml(opts.pickupAddress)}`)
  }
  lines.push(paiement)
  if (opts.conflictWarning) lines.push(`⚠️ <b>Chevauchement calendrier détecté</b> — vérifiez votre planning.`)
  lines.push(`Le créneau est bloqué dans votre calendrier.`)
  return { text: lines.join('\n') }
}

/**
 * Alerte pré-course (~2 h avant la prise en charge) : récap de la course +
 * boutons ouvrant directement la navigation (Google Maps / Waze) vers le départ.
 */
export function preRideAlertMessage(opts: {
  driverDisplayName: string
  customerName: string
  customerPhone?: string | null
  scheduledAt: Date
  timezone: string
  type: 'TRANSFER' | 'HOURLY'
  durationHours?: number | null
  pickupAddress?: string | null
  dropoffAddress?: string | null
  mapsUrl?: string | null
  wazeUrl?: string | null
  // Note de règlement : « déjà payée en ligne » ou « X € à encaisser (espèces) »
  paymentNote?: string
  // Id de la course : active le bouton « Je pars » (suivi de course client).
  bookingId?: string
}): { text: string; buttons: InlineButton[][] } {
  const lines = [
    hello(opts.driverDisplayName),
    `⏰ <b>Course dans ~2 h</b> — ${formatRideDateTime(opts.scheduledAt, opts.timezone)}`,
    `Client : ${escHtml(opts.customerName)}${opts.customerPhone ? ` — 📞 ${escHtml(opts.customerPhone)}` : ''}`,
  ]
  if (opts.type === 'TRANSFER') {
    lines.push(`📍 Départ : ${escHtml(opts.pickupAddress ?? '?')}`)
    lines.push(`🏁 Arrivée : ${escHtml(opts.dropoffAddress ?? '?')}`)
  } else {
    lines.push(`🕐 Mise à disposition ${opts.durationHours ?? '?'} h`)
    if (opts.pickupAddress) lines.push(`📍 Départ : ${escHtml(opts.pickupAddress)}`)
  }
  if (opts.paymentNote) lines.push(opts.paymentNote)
  if (opts.bookingId) {
    lines.push(`Au moment de partir, touchez <b>« Je pars »</b> : le client est prévenu et peut vous suivre.`)
  }

  const navButtons: InlineButton[] = []
  if (opts.mapsUrl) navButtons.push({ text: '🧭 Google Maps', url: opts.mapsUrl })
  if (opts.wazeUrl) navButtons.push({ text: '🚗 Waze', url: opts.wazeUrl })

  const buttons: InlineButton[][] = []
  if (opts.bookingId) {
    buttons.push([{ text: '🚗 Je pars — prévenir le client', callback_data: `track:depart:${opts.bookingId}` }])
  }
  if (navButtons.length) buttons.push(navButtons)

  return { text: lines.join('\n'), buttons }
}

// ── Suivi de course : messages d'accompagnement des étapes chauffeur ──

/**
 * Après « Je pars » : confirme l'envoi de l'email client et guide le chauffeur
 * vers le partage de position en direct Telegram (c'est lui qui alimente la
 * carte du client — Telegram gère le GPS en arrière-plan, même avec Waze devant).
 */
export function departAckMessage(opts: { customerName: string; bookingId: string }): {
  text: string
  buttons: InlineButton[][]
} {
  return {
    text: [
      `🚗 <b>C'est parti !</b> ${escHtml(opts.customerName)} est prévenu que vous êtes en route.`,
      ``,
      `📍 Pour qu'il vous suive sur la carte : partagez votre <b>position en direct</b> dans cette conversation — 📎 → <b>Position</b> → <b>Partager ma position en direct</b> (1 h).`,
      `Vous pouvez ensuite repasser sur Waze/Maps : Telegram continue le partage en arrière-plan.`,
    ].join('\n'),
    buttons: [
      [{ text: '🅿️ Je suis sur place', callback_data: `track:arrive:${opts.bookingId}` }],
      [{ text: '🧍 Client à bord', callback_data: `track:pickup:${opts.bookingId}` }],
    ],
  }
}

/** Après « Je suis sur place » : le client le voit sur sa page de suivi. */
export function arriveAckMessage(opts: { bookingId: string }): {
  text: string
  buttons: InlineButton[][]
} {
  return {
    text: `🅿️ Bien noté — vous êtes sur place. Le client le voit sur sa page de suivi.`,
    buttons: [[{ text: '🧍 Client à bord', callback_data: `track:pickup:${opts.bookingId}` }]],
  }
}

/** Après « Client à bord » : le suivi continue vers la destination. */
export function pickupAckMessage(): { text: string } {
  return {
    text: `🧍 Client à bord — bonne route ! Le suivi continue vers la destination (le client peut partager sa course à ses proches). Pensez à « Marquer comme terminée » dans votre espace à l'arrivée.`,
  }
}

/** Première position en direct reçue et rattachée à une course. */
export function liveLocationAckMessage(): { text: string } {
  return {
    text: `📡 <b>Position en direct reçue</b> — votre client vous suit maintenant sur la carte. Vous pouvez basculer sur Waze/Maps, le partage continue en arrière-plan.`,
  }
}

/**
 * Notifie le chauffeur d'un report d'horaire demandé par le client — soit
 * informatif (déjà appliqué, course pas imminente), soit avec action requise
 * (à valider depuis l'espace car la course est proche).
 */
export function rescheduleMessage(opts: {
  driverDisplayName: string
  customerName: string
  oldScheduledAt: Date
  newScheduledAt: Date
  timezone: string
  needsApproval: boolean
}): { text: string } {
  const lines = [
    hello(opts.driverDisplayName),
    opts.needsApproval
      ? `🗓️ <b>Modification d'horaire à valider</b>`
      : `🗓️ <b>Course déplacée</b>`,
    `Client : ${escHtml(opts.customerName)}`,
    `Avant : ${formatRideDateTime(opts.oldScheduledAt, opts.timezone)}`,
    `Après : <b>${formatRideDateTime(opts.newScheduledAt, opts.timezone)}</b>`,
  ]
  if (opts.needsApproval) {
    lines.push(`La course est proche : acceptez ou refusez depuis votre espace.`)
  } else {
    lines.push(`Votre calendrier est déjà à jour.`)
  }
  return { text: lines.join('\n') }
}
