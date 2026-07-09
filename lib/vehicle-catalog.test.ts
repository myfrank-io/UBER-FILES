import { describe, it, expect } from 'vitest'
import { customCatalogEntry, searchCatalog } from './vehicle-catalog'

describe('customCatalogEntry', () => {
  it('dérive make/modelFamily en slug et garde le libellé saisi', () => {
    const e = customCatalogEntry('Hyundai Ioniq 6')
    expect(e).toEqual({ make: 'hyundai', modelFamily: 'ioniq-6', modelLabel: 'Hyundai Ioniq 6' })
  })

  it('normalise les espaces et les accents', () => {
    const e = customCatalogEntry('  Citroën   C5   Aircross ')
    expect(e.modelLabel).toBe('Citroën C5 Aircross')
    expect(e.make).toBe('citroen')
    expect(e.modelFamily).toBe('c5-aircross')
  })

  it('reste correct pour un seul mot', () => {
    const e = customCatalogEntry('Ioniq')
    expect(e.make).toBe('ioniq')
    expect(e.modelFamily).toBe('ioniq')
    expect(e.modelLabel).toBe('Ioniq')
  })
})

describe('searchCatalog', () => {
  it('trouve un modèle du catalogue (insensible aux accents)', () => {
    const results = searchCatalog('classe v')
    expect(results.some((r) => r.label === 'Mercedes Classe V')).toBe(true)
  })
})
