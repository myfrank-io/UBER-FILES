// Notifications push (PWA) envoyées au chauffeur à chaque étape du parcours
// client — logique pure : construit titre, corps et lien de chaque notification.
// L'envoi (abonnements, clés VAPID) vit dans server/utils/push.ts.
//
// Le téléphone coupe un corps de notification au-delà d'une centaine de
// caractères : on va à l'essentiel — qui, quoi, quand, combien — et on
// raccourcit les adresses.
import { formatMoney } from './money'

export interface PushPayload {
  title: string
  body: string
  /** Page ouverte au tap (chemin relatif au site). */
  url: string
  /** Regroupe les notifications d'une même course : la plus récente remplace la précédente. */
  tag?: string
}

type RideType = 'TRANSFER' | 'HOURLY'

export interface RideSummary {
  type: RideType
  durationHours?: number | null
  pickupAddress?: string | null
  dropoffAddress?: string | null
  /** Transfert aéroport : trajet en clair (« Orly → Rive gauche »), prime sur les adresses. */
  airportLabel?: string | null
}

const MAX_PLACE = 28

/** Partie utile d'une adresse (avant la première virgule), bornée en longueur. */
export function shortPlace(address: string | null | undefined): string | null {
  if (!address) return null
  const head = address.split(',')[0]!.trim()
  if (!head) return null
  return head.length > MAX_PLACE ? `${head.slice(0, MAX_PLACE - 1).trimEnd()}…` : head
}

/** « Paris 8e → Orly », « Mise à dispo 3 h · Paris », ou « Transfert » à défaut. */
export function rideLabel(ride: RideSummary): string {
  if (ride.airportLabel) return ride.airportLabel
  const from = shortPlace(ride.pickupAddress)
  if (ride.type === 'HOURLY') {
    const hours = ride.durationHours ? ` ${ride.durationHours} h` : ''
    return `Mise à dispo${hours}${from ? ` · ${from}` : ''}`
  }
  const to = shortPlace(ride.dropoffAddress)
  if (from && to) return `${from} → ${to}`
  return from ?? to ?? 'Transfert'
}

/** Date courte dans le fuseau du chauffeur : « jeu. 24 juil., 11:30 ». */
export function compactDateTime(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(typeof value === 'string' ? new Date(value) : value)
}

interface RideMoment {
  customerName: string
  scheduledAt: Date | string
  timezone: string
}

/** Étape 1 — le client vient d'envoyer sa demande. */
export function newRequestPush(
  o: RideSummary &
    RideMoment & {
      amountCents: number
      currency: string
      hasConflict: boolean
      /** Devis déjà envoyé au client (paiement en ligne en cours) : rien à valider. */
      autoSent: boolean
      quoteId: string
    },
): PushPayload {
  const parts = [o.customerName, rideLabel(o), compactDateTime(o.scheduledAt, o.timezone), formatMoney(o.amountCents, o.currency)]
  return {
    title: o.autoSent ? 'Nouvelle demande — paiement en cours' : 'Nouvelle demande à valider',
    body: parts.join(' · ') + (o.hasConflict ? ' · ⚠️ créneau déjà pris' : ''),
    url: '/dashboard',
    tag: `quote:${o.quoteId}`,
  }
}

/** Étape 2 — la course est confirmée (payée en ligne, ou règlement sur place). */
export function bookingConfirmedPush(
  o: RideSummary &
    RideMoment & {
      amountCents: number
      currency: string
      paidOnline: boolean
      /** Règlement sur place : moyen choisi (« Espèces »…). */
      methodLabel?: string | null
      conflictWarning?: boolean
      quoteId: string
    },
): PushPayload {
  const parts = [o.customerName, rideLabel(o), compactDateTime(o.scheduledAt, o.timezone), formatMoney(o.amountCents, o.currency)]
  return {
    title: o.paidOnline
      ? 'Course confirmée · payée en ligne'
      : `Course confirmée · ${o.methodLabel ?? 'règlement'} sur place`,
    body: parts.join(' · ') + (o.conflictWarning ? ' · ⚠️ chevauche une autre course' : ''),
    url: '/dashboard/courses',
    tag: `quote:${o.quoteId}`,
  }
}

/** Étape 3 — le client déplace sa course (appliqué, ou à valider si imminente). */
export function reschedulePush(o: {
  customerName: string
  newScheduledAt: Date | string
  timezone: string
  needsApproval: boolean
  bookingId: string
}): PushPayload {
  return {
    title: o.needsApproval ? 'Report à valider' : 'Course déplacée',
    body: `${o.customerName} · nouvelle date : ${compactDateTime(o.newScheduledAt, o.timezone)}`,
    url: o.needsApproval ? '/dashboard' : '/dashboard/courses',
    tag: `booking:${o.bookingId}`,
  }
}

/** Étape 4 — le client annule. */
export function cancellationPush(
  o: RideMoment & { refundCents: number; currency: string; bookingId: string },
): PushPayload {
  const refund = o.refundCents > 0 ? ` · remboursé ${formatMoney(o.refundCents, o.currency)}` : ''
  return {
    title: 'Course annulée par le client',
    body: `${o.customerName} · ${compactDateTime(o.scheduledAt, o.timezone)}${refund}`,
    url: '/dashboard/courses',
    tag: `booking:${o.bookingId}`,
  }
}

/** Rappel avant la course (envoyé par la tâche planifiée). */
export function preRidePush(
  o: RideMoment & { pickupAddress?: string | null; paymentNote: string; bookingId: string },
): PushPayload {
  const place = shortPlace(o.pickupAddress)
  return {
    title: `Rappel · ${compactDateTime(o.scheduledAt, o.timezone)}`,
    body: [o.customerName, place, o.paymentNote].filter(Boolean).join(' · '),
    url: '/dashboard/courses',
    tag: `booking:${o.bookingId}`,
  }
}

/** Fin de parcours — retour privé laissé par le client (note < 5). */
export function reviewFeedbackPush(o: { rating: number; customerName?: string | null }): PushPayload {
  const stars = '★'.repeat(o.rating) + '☆'.repeat(Math.max(0, 5 - o.rating))
  return {
    title: `Retour client ${stars}`,
    body: `${o.customerName || 'Un client'} vous a laissé un retour privé (${o.rating}/5).`,
    url: '/dashboard',
  }
}
