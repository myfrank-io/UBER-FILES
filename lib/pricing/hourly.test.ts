import { describe, expect, it } from 'vitest'
import { priceHourly, selectHourlyTier } from './hourly'
import { PricingError } from './transfer'
import type { DriverPricingParams, HourlyRateTierInput } from './types'

const params: DriverPricingParams = {
  currency: 'eur',
  minimumFareCents: 2500,
  timezone: 'Europe/Paris',
}

// Grille dégressive : 1h = 60 €/h, 4h = 55 €/h, 8h = 50 €/h.
const tiers: HourlyRateTierInput[] = [
  { minHours: 1, pricePerHourCents: 6000 },
  { minHours: 4, pricePerHourCents: 5500 },
  { minHours: 8, pricePerHourCents: 5000 },
]

describe('selectHourlyTier', () => {
  it('choisit le palier exact', () => {
    expect(selectHourlyTier(tiers, 4)?.pricePerHourCents).toBe(5500)
  })
  it('choisit le palier inférieur le plus proche', () => {
    expect(selectHourlyTier(tiers, 6)?.pricePerHourCents).toBe(5500)
    expect(selectHourlyTier(tiers, 10)?.pricePerHourCents).toBe(5000)
  })
  it('renvoie null sous le plus petit palier', () => {
    expect(selectHourlyTier(tiers, 0.5)).toBeNull()
  })
})

describe('priceHourly', () => {
  it('calcule le prix au palier 1h', () => {
    const r = priceHourly({ durationHours: 1, tiers, surcharges: [], params })
    expect(r.amountCents).toBe(6000)
  })

  it('applique le tarif dégressif à 4h', () => {
    const r = priceHourly({ durationHours: 4, tiers, surcharges: [], params })
    expect(r.amountCents).toBe(22000) // 4 × 55 €
  })

  it('applique le tarif dégressif à 8h', () => {
    const r = priceHourly({ durationHours: 8, tiers, surcharges: [], params })
    expect(r.amountCents).toBe(40000) // 8 × 50 €
  })

  it('utilise le palier inférieur pour une durée intermédiaire', () => {
    const r = priceHourly({ durationHours: 5, tiers, surcharges: [], params })
    expect(r.amountCents).toBe(27500) // 5 × 55 €
  })

  it('applique une majoration', () => {
    const r = priceHourly({
      durationHours: 2,
      tiers,
      surcharges: [{ name: 'Bagages', kind: 'FIXED', amount: 1000 }],
      params,
    })
    expect(r.amountCents).toBe(13000) // 2 × 60 € + 10 €
  })

  it('rejette une durée nulle', () => {
    expect(() => priceHourly({ durationHours: 0, tiers, surcharges: [], params })).toThrow(
      PricingError,
    )
  })

  it('rejette une durée sous le plus petit palier', () => {
    expect(() =>
      priceHourly({ durationHours: 0.5, tiers, surcharges: [], params }),
    ).toThrow(PricingError)
  })

  it('rejette une grille vide', () => {
    expect(() =>
      priceHourly({ durationHours: 2, tiers: [], surcharges: [], params }),
    ).toThrow(PricingError)
  })
})
