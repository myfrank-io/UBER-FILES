import { describe, expect, it } from 'vitest'
import { priceHourly } from './hourly'
import { PricingError } from './transfer'
import type { DriverPricingParams, HourlyRateInput } from './types'

const params: DriverPricingParams = {
  currency: 'eur',
  minimumFareCents: 2500,
  timezone: 'Europe/Paris',
}

// Les 8 premières heures à 50 €/h, puis 40 €/h par heure supplémentaire.
const rate: HourlyRateInput = {
  pricePerHourCents: 5000,
  overtimeAfterHours: 8,
  overtimePricePerHourCents: 4000,
}

// Tarif unique, sans heures supplémentaires.
const flatRate: HourlyRateInput = { pricePerHourCents: 6000 }

describe('priceHourly', () => {
  it('facture au tarif de base sous le seuil', () => {
    const r = priceHourly({ durationHours: 5, rate, surcharges: [], params })
    expect(r.amountCents).toBe(25000) // 5 × 50 €
    expect(r.breakdown).toHaveLength(1)
  })

  it('facture au tarif de base au seuil exact', () => {
    const r = priceHourly({ durationHours: 8, rate, surcharges: [], params })
    expect(r.amountCents).toBe(40000) // 8 × 50 €
    expect(r.breakdown).toHaveLength(1)
  })

  it('facture les heures au-delà du seuil au tarif heure supplémentaire', () => {
    const r = priceHourly({ durationHours: 10, rate, surcharges: [], params })
    expect(r.amountCents).toBe(48000) // 8 × 50 € + 2 × 40 €
    expect(r.breakdown).toHaveLength(2)
    expect(r.breakdown[0]).toMatchObject({ label: 'Mise à disposition', amountCents: 40000 })
    expect(r.breakdown[1]).toMatchObject({ label: 'Heures supplémentaires', amountCents: 8000 })
  })

  it('ne facture jamais moins pour une durée plus longue', () => {
    const at8 = priceHourly({ durationHours: 8, rate, surcharges: [], params })
    const at9 = priceHourly({ durationHours: 9, rate, surcharges: [], params })
    expect(at9.amountCents).toBeGreaterThan(at8.amountCents)
  })

  it('applique le tarif unique sans configuration heures supplémentaires', () => {
    const r = priceHourly({ durationHours: 12, rate: flatRate, surcharges: [], params })
    expect(r.amountCents).toBe(72000) // 12 × 60 €
    expect(r.breakdown).toHaveLength(1)
  })

  it('remonte au minimum de course', () => {
    const r = priceHourly({
      durationHours: 1,
      rate: { pricePerHourCents: 2000 },
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(2500)
    expect(r.breakdown[1]!.label).toBe('Ajustement au minimum de course')
  })

  it('applique une majoration après le calcul horaire', () => {
    const r = priceHourly({
      durationHours: 10,
      rate,
      surcharges: [{ name: 'Bagages', kind: 'FIXED', amount: 1000 }],
      params,
    })
    expect(r.amountCents).toBe(49000) // 8 × 50 € + 2 × 40 € + 10 €
  })

  it('rejette une durée nulle', () => {
    expect(() => priceHourly({ durationHours: 0, rate, surcharges: [], params })).toThrow(
      PricingError,
    )
  })

  it('rejette une configuration sans tarif horaire', () => {
    expect(() =>
      priceHourly({ durationHours: 2, rate: { pricePerHourCents: 0 }, surcharges: [], params }),
    ).toThrow(PricingError)
  })
})
