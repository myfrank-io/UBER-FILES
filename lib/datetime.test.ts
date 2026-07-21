import { describe, it, expect } from 'vitest'
import {
  formatRideDate,
  formatRideDateTime,
  formatRideTime,
  timezoneCity,
  timezoneLabel,
} from './datetime'

// Instant fixe : 2026-07-24T09:30:00Z (été → Paris = UTC+2 = 11:30 ; Guadeloupe = UTC-4 = 05:30).
const summer = new Date('2026-07-24T09:30:00Z')
// Hiver : 2026-01-24T10:30:00Z (Paris = UTC+1 = 11:30).
const winter = new Date('2026-01-24T10:30:00Z')

describe('formatRideDateTime', () => {
  it('rend l’heure dans le fuseau du chauffeur (Paris été = UTC+2)', () => {
    const s = formatRideDateTime(summer, 'Europe/Paris', 'fr')
    expect(s).toContain('11:30')
    expect(s).toContain('(heure de Paris)')
  })

  it('gère l’heure d’hiver (Paris = UTC+1)', () => {
    expect(formatRideDateTime(winter, 'Europe/Paris', 'fr')).toContain('11:30')
  })

  it('rend le MÊME instant différemment selon le fuseau (Antilles)', () => {
    expect(formatRideDateTime(summer, 'America/Guadeloupe', 'fr')).toContain('05:30')
    expect(formatRideDateTime(summer, 'America/Guadeloupe', 'fr')).toContain('(heure de Guadeloupe)')
  })

  it('sans libellé de fuseau quand withZone=false', () => {
    const s = formatRideDateTime(summer, 'Europe/Paris', 'fr', { withZone: false })
    expect(s).toContain('11:30')
    expect(s).not.toContain('heure de')
  })

  it('accepte une chaîne ISO', () => {
    expect(formatRideDateTime('2026-07-24T09:30:00Z', 'Europe/Paris', 'fr')).toContain('11:30')
  })
})

describe('formatRideTime / formatRideDate', () => {
  it('formatRideTime rend HH:MM dans le fuseau', () => {
    expect(formatRideTime(summer, 'Europe/Paris')).toBe('11:30')
  })
  it('formatRideDate ne contient pas d’heure', () => {
    expect(formatRideDate(summer, 'Europe/Paris')).not.toContain('11:30')
  })
})

describe('timezoneLabel / timezoneCity', () => {
  it('extrait la ville et construit le libellé', () => {
    expect(timezoneCity('Europe/Paris')).toBe('Paris')
    expect(timezoneCity('America/Port-au-Prince')).toBe('Port-au-Prince')
    expect(timezoneLabel('Europe/Paris', 'fr')).toBe('heure de Paris')
    expect(timezoneLabel('Europe/Paris', 'en')).toBe('Paris time')
  })
})
