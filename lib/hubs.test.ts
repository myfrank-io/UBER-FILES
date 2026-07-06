import { describe, it, expect } from 'vitest'
import { findHubByText, findTerminal, pickupWithTerminal, HUBS } from './hubs'

describe('findHubByText', () => {
  it('reconnaît un aéroport via un alias (insensible casse/accents)', () => {
    expect(findHubByText('Aéroport Charles de Gaulle, Roissy')?.id).toBe('cdg')
    expect(findHubByText('ROISSY CDG')?.id).toBe('cdg')
    expect(findHubByText('Orly Sud')?.id).toBe('orly')
  })
  it('renvoie null pour une adresse sans hub', () => {
    expect(findHubByText('10 rue de Rivoli, Paris')).toBeNull()
    expect(findHubByText('')).toBeNull()
    expect(findHubByText(null)).toBeNull()
  })
})

describe('findTerminal', () => {
  it('retrouve un terminal par code', () => {
    const cdg = HUBS.find((h) => h.id === 'cdg')!
    expect(findTerminal(cdg, 'T2E')?.label).toContain('2E')
    expect(findTerminal(cdg, 'INCONNU')).toBeNull()
    expect(findTerminal(cdg, null)).toBeNull()
  })
})

describe('pickupWithTerminal', () => {
  it('enrichit l’adresse du libellé de terminal', () => {
    const out = pickupWithTerminal('Aéroport CDG', 'T2E')
    expect(out).toContain('Aéroport CDG')
    expect(out).toContain('·')
    expect(out).toContain('2E')
  })
  it('renvoie l’adresse inchangée sans terminal', () => {
    expect(pickupWithTerminal('Aéroport CDG', null)).toBe('Aéroport CDG')
    expect(pickupWithTerminal('Aéroport CDG', undefined)).toBe('Aéroport CDG')
  })
})
