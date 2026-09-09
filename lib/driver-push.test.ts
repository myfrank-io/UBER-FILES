import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'
import {
  bookingConfirmedPush,
  cancellationPush,
  compactDateTime,
  newRequestPush,
  preRidePush,
  reschedulePush,
  reviewFeedbackPush,
  rideLabel,
  shortPlace,
} from './driver-push'

// 24 juillet 2026 à 11:30, heure de Paris (09:30 UTC).
const AT = new Date('2026-07-24T09:30:00.000Z')
const TZ = 'Europe/Paris'

describe('shortPlace / rideLabel', () => {
  it("garde la partie utile de l'adresse et borne sa longueur", () => {
    expect(shortPlace('11 rue du Muguet, 29200 Brest')).toBe('11 rue du Muguet')
    expect(shortPlace('Aéroport Paris-Charles-de-Gaulle Terminal 2E, Roissy')).toBe('Aéroport Paris-Charles-de-G…')
    expect(shortPlace('')).toBeNull()
    expect(shortPlace(null)).toBeNull()
  })

  it('décrit un transfert, une mise à dispo, ou un aéroport en clair', () => {
    expect(rideLabel({ type: 'TRANSFER', pickupAddress: 'Paris 8e, France', dropoffAddress: 'Orly, France' })).toBe('Paris 8e → Orly')
    expect(rideLabel({ type: 'TRANSFER', pickupAddress: 'Paris 8e' })).toBe('Paris 8e')
    expect(rideLabel({ type: 'TRANSFER' })).toBe('Transfert')
    expect(rideLabel({ type: 'HOURLY', durationHours: 3, pickupAddress: 'Lyon, France' })).toBe('Mise à dispo 3 h · Lyon')
    expect(rideLabel({ type: 'HOURLY' })).toBe('Mise à dispo')
    expect(rideLabel({ type: 'TRANSFER', airportLabel: 'Orly → Rive gauche', pickupAddress: 'x' })).toBe('Orly → Rive gauche')
  })
})

describe('compactDateTime', () => {
  it('affiche la date dans le fuseau du chauffeur, en court', () => {
    expect(compactDateTime(AT, TZ)).toBe('ven. 24 juil., 11:30')
    expect(compactDateTime(AT.toISOString(), 'America/Martinique')).toBe('ven. 24 juil., 05:30')
  })
})

describe('notifications par étape', () => {
  const ride = { customerName: 'Marie Dupont', scheduledAt: AT, timezone: TZ, type: 'TRANSFER' as const, pickupAddress: 'Paris 8e, France', dropoffAddress: 'Orly, France', amountCents: 8500, currency: 'eur' }

  it('nouvelle demande : à valider, ou paiement en cours si le devis est parti seul', () => {
    const p = newRequestPush({ ...ride, hasConflict: false, autoSent: false, quoteId: 'q1' })
    expect(p.title).toBe('Nouvelle demande à valider')
    expect(p.body).toBe(`Marie Dupont · Paris 8e → Orly · ven. 24 juil., 11:30 · ${formatMoney(8500, 'eur')}`)
    expect(p.url).toBe('/dashboard')
    expect(p.tag).toBe('quote:q1')
    expect(newRequestPush({ ...ride, hasConflict: true, autoSent: true, quoteId: 'q1' })).toMatchObject({
      title: 'Nouvelle demande — paiement en cours',
      body: expect.stringContaining('⚠️ créneau déjà pris'),
    })
  })

  it('confirmation : payée en ligne ou à encaisser sur place, même tag que la demande', () => {
    expect(bookingConfirmedPush({ ...ride, paidOnline: true, quoteId: 'q1' })).toMatchObject({
      title: 'Course confirmée · payée en ligne',
      url: '/dashboard/courses',
      tag: 'quote:q1',
    })
    expect(bookingConfirmedPush({ ...ride, paidOnline: false, methodLabel: 'Espèces', conflictWarning: true, quoteId: 'q1' })).toMatchObject({
      title: 'Course confirmée · Espèces sur place',
      body: expect.stringContaining('⚠️ chevauche une autre course'),
    })
  })

  it('report : à valider quand la course est imminente', () => {
    const p = reschedulePush({ customerName: 'Marie', newScheduledAt: AT, timezone: TZ, needsApproval: true, bookingId: 'b1' })
    expect(p).toEqual({ title: 'Report à valider', body: 'Marie · nouvelle date : ven. 24 juil., 11:30', url: '/dashboard', tag: 'booking:b1' })
    expect(reschedulePush({ customerName: 'Marie', newScheduledAt: AT, timezone: TZ, needsApproval: false, bookingId: 'b1' })).toMatchObject({ title: 'Course déplacée', url: '/dashboard/courses' })
  })

  it("annulation : mentionne le remboursement seulement s'il y en a un", () => {
    expect(cancellationPush({ customerName: 'Marie', scheduledAt: AT, timezone: TZ, refundCents: 0, currency: 'eur', bookingId: 'b1' }).body).toBe('Marie · ven. 24 juil., 11:30')
    expect(cancellationPush({ customerName: 'Marie', scheduledAt: AT, timezone: TZ, refundCents: 4250, currency: 'eur', bookingId: 'b1' }).body).toBe(`Marie · ven. 24 juil., 11:30 · remboursé ${formatMoney(4250, 'eur')}`)
  })

  it('rappel et retour client', () => {
    expect(preRidePush({ customerName: 'Marie', scheduledAt: AT, timezone: TZ, pickupAddress: 'Gare de Lyon, Paris', paymentNote: 'Course déjà réglée en ligne — rien à encaisser.', bookingId: 'b1' })).toEqual({
      title: 'Rappel · ven. 24 juil., 11:30',
      body: 'Marie · Gare de Lyon · Course déjà réglée en ligne — rien à encaisser.',
      url: '/dashboard/courses',
      tag: 'booking:b1',
    })
    expect(reviewFeedbackPush({ rating: 3, customerName: 'Marie' })).toEqual({ title: 'Retour client ★★★☆☆', body: 'Marie vous a laissé un retour privé (3/5).', url: '/dashboard' })
    expect(reviewFeedbackPush({ rating: 1 }).body).toBe('Un client vous a laissé un retour privé (1/5).')
  })
})
