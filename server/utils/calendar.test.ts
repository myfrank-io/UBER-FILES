import { describe, expect, it } from 'vitest'
import { bookingSlot, overlaps } from './calendar'

const driver = { approachBufferMinutes: 30 }
const scheduledAt = new Date('2026-06-15T10:00:00Z') // 10h00 UTC

describe('bookingSlot', () => {
  it('calcule le créneau avec approche de 30 min', () => {
    const slot = bookingSlot(driver, scheduledAt, 3600) // 1h de course
    // startAt = 10h00 - 30min = 09h30
    expect(slot.startAt).toEqual(new Date('2026-06-15T09:30:00Z'))
    // endAt = 10h00 + 3600s + 30min = 11h30
    expect(slot.endAt).toEqual(new Date('2026-06-15T11:30:00Z'))
  })

  it('fonctionne sans buffer (0 min)', () => {
    const slot = bookingSlot({ approachBufferMinutes: 0 }, scheduledAt, 7200)
    expect(slot.startAt).toEqual(scheduledAt)
    expect(slot.endAt).toEqual(new Date('2026-06-15T12:00:00Z'))
  })

  it('gère une durée nulle (réservation instantanée)', () => {
    const slot = bookingSlot(driver, scheduledAt, 0)
    expect(slot.startAt < slot.endAt).toBe(true) // buffer seul
  })
})

describe('overlaps', () => {
  const base = {
    startAt: new Date('2026-06-15T10:00:00Z'),
    endAt: new Date('2026-06-15T12:00:00Z'),
  }

  it('détecte un chevauchement partiel (début avant fin)', () => {
    const other = { startAt: new Date('2026-06-15T11:00:00Z'), endAt: new Date('2026-06-15T13:00:00Z') }
    expect(overlaps(base, other)).toBe(true)
  })

  it('détecte un chevauchement partiel (fin avant début)', () => {
    const other = { startAt: new Date('2026-06-15T09:00:00Z'), endAt: new Date('2026-06-15T11:00:00Z') }
    expect(overlaps(base, other)).toBe(true)
  })

  it('détecte un créneau inclus entièrement', () => {
    const other = { startAt: new Date('2026-06-15T10:30:00Z'), endAt: new Date('2026-06-15T11:30:00Z') }
    expect(overlaps(base, other)).toBe(true)
  })

  it('ne détecte pas de chevauchement pour des créneaux consécutifs (bords exacts)', () => {
    // base se termine à 12h, other commence à 12h — pas de chevauchement
    const other = { startAt: new Date('2026-06-15T12:00:00Z'), endAt: new Date('2026-06-15T14:00:00Z') }
    expect(overlaps(base, other)).toBe(false)
  })

  it('ne détecte pas de chevauchement pour des créneaux disjoints', () => {
    const other = { startAt: new Date('2026-06-15T13:00:00Z'), endAt: new Date('2026-06-15T15:00:00Z') }
    expect(overlaps(base, other)).toBe(false)
  })

  it("détecte un chevauchement quand un créneau englobe entièrement l'autre", () => {
    const large = { startAt: new Date('2026-06-15T08:00:00Z'), endAt: new Date('2026-06-15T18:00:00Z') }
    expect(overlaps(base, large)).toBe(true)
  })
})
