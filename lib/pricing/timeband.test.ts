import { describe, expect, it } from 'vitest'
import { localMoment, minuteInRange, selectBand } from './timeband'
import { computeApplicationFee } from './index'
import type { TransferRateBandInput } from './types'

describe('minuteInRange', () => {
  it('gère une plage simple', () => {
    expect(minuteInRange(8 * 60, 6 * 60, 22 * 60)).toBe(true)
    expect(minuteInRange(23 * 60, 6 * 60, 22 * 60)).toBe(false)
  })
  it('gère une plage qui chevauche minuit', () => {
    const start = 22 * 60
    const end = 22 * 60 + 8 * 60 // 06h le lendemain
    expect(minuteInRange(23 * 60, start, end)).toBe(true)
    expect(minuteInRange(2 * 60, start, end)).toBe(true)
    expect(minuteInRange(12 * 60, start, end)).toBe(false)
    expect(minuteInRange(6 * 60, start, end)).toBe(false) // borne de fin exclue
  })
})

describe('localMoment', () => {
  it('convertit en heure de Paris (été, UTC+2)', () => {
    const m = localMoment(new Date('2026-06-15T12:00:00Z'), 'Europe/Paris')
    expect(m.minuteOfDay).toBe(14 * 60) // 14h00
    expect(m.dayOfWeek).toBe(1) // lundi
  })
  it('convertit en heure de Paris (hiver, UTC+1)', () => {
    const m = localMoment(new Date('2026-01-15T12:00:00Z'), 'Europe/Paris')
    expect(m.minuteOfDay).toBe(13 * 60) // 13h00
  })
  it('renvoie 0 pour dimanche', () => {
    const m = localMoment(new Date('2026-06-14T12:00:00Z'), 'Europe/Paris')
    expect(m.dayOfWeek).toBe(0)
  })
})

describe('selectBand priorité et jours', () => {
  const bands: TransferRateBandInput[] = [
    {
      name: 'Standard',
      pricePerKmCents: 200,
      daysOfWeek: [],
      startMinute: 0,
      endMinute: 1440,
      priority: 0,
      isDefault: true,
    },
    {
      name: 'Pointe semaine',
      pricePerKmCents: 280,
      daysOfWeek: [1, 2, 3, 4, 5],
      startMinute: 7 * 60,
      endMinute: 10 * 60,
      priority: 5,
      isDefault: false,
    },
  ]

  it('choisit la bande de pointe en semaine aux heures concernées', () => {
    // Lundi 08h30 Paris (été) -> 06h30 UTC
    const band = selectBand(bands, new Date('2026-06-15T06:30:00Z'), 'Europe/Paris')
    expect(band?.name).toBe('Pointe semaine')
  })

  it('retombe sur la bande standard le week-end', () => {
    // Dimanche 08h30 Paris
    const band = selectBand(bands, new Date('2026-06-14T06:30:00Z'), 'Europe/Paris')
    expect(band?.name).toBe('Standard')
  })

  it('retombe sur la bande standard hors heures de pointe', () => {
    // Lundi 15h Paris
    const band = selectBand(bands, new Date('2026-06-15T13:00:00Z'), 'Europe/Paris')
    expect(band?.name).toBe('Standard')
  })
})

describe('computeApplicationFee', () => {
  it('renvoie 0 quand la commission est nulle (lancement)', () => {
    expect(computeApplicationFee(10000, 0)).toBe(0)
  })
  it('calcule la commission en points de base', () => {
    expect(computeApplicationFee(10000, 1000)).toBe(1000) // 10 %
    expect(computeApplicationFee(12345, 250)).toBe(309) // 2,5 % arrondi
  })
})
