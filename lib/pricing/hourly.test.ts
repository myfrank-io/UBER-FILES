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

// Deux tranches : 8 premières heures à 50 €/h, puis 40 €/h, puis 30 €/h au-delà de 12 h.
const twoTierRate: HourlyRateInput = {
  ...rate,
  overtime2AfterHours: 12,
  overtime2PricePerHourCents: 3000,
}

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

  it('facture la seconde tranche au-delà de son seuil', () => {
    const r = priceHourly({ durationHours: 14, rate: twoTierRate, surcharges: [], params })
    expect(r.amountCents).toBe(62000) // 8 × 50 € + 4 × 40 € + 2 × 30 €
    expect(r.breakdown).toHaveLength(3)
    expect(r.breakdown[0]).toMatchObject({ label: 'Mise à disposition', amountCents: 40000 })
    expect(r.breakdown[1]).toMatchObject({
      label: "Heures supplémentaires (jusqu'à 12 h)",
      amountCents: 16000,
    })
    expect(r.breakdown[2]).toMatchObject({
      label: 'Heures supplémentaires (au-delà de 12 h)',
      amountCents: 6000,
    })
  })

  it('n\'entame pas la seconde tranche sous son seuil', () => {
    const r = priceHourly({ durationHours: 10, rate: twoTierRate, surcharges: [], params })
    expect(r.amountCents).toBe(48000) // 8 × 50 € + 2 × 40 €, identique à une seule tranche
    expect(r.breakdown).toHaveLength(2)
    expect(r.breakdown[1]).toMatchObject({ label: 'Heures supplémentaires' })
  })

  it('ignore une seconde tranche sans première tranche', () => {
    const r = priceHourly({
      durationHours: 14,
      rate: { pricePerHourCents: 5000, overtime2AfterHours: 12, overtime2PricePerHourCents: 3000 },
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(70000) // 14 × 50 €
    expect(r.breakdown).toHaveLength(1)
  })

  it('ignore une seconde tranche dont le seuil ne dépasse pas le premier', () => {
    const r = priceHourly({
      durationHours: 14,
      rate: { ...rate, overtime2AfterHours: 8, overtime2PricePerHourCents: 3000 },
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(64000) // 8 × 50 € + 6 × 40 € : la config incohérente est ignorée
    expect(r.breakdown).toHaveLength(2)
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

describe('priceHourly — durée minimale du chauffeur', () => {
  it('refuse une demande plus courte que le minimum, en disant lequel', () => {
    expect(() =>
      priceHourly({
        durationHours: 1,
        rate: { pricePerHourCents: 6500, minHours: 2 },
        surcharges: [],
        params,
      }),
    ).toThrowError(/à partir de 2 h/)
  })

  it('accepte la durée minimale elle-même et au-delà', () => {
    const rate = { pricePerHourCents: 6500, minHours: 2 }
    expect(priceHourly({ durationHours: 2, rate, surcharges: [], params }).amountCents).toBe(13000)
    expect(priceHourly({ durationHours: 3, rate, surcharges: [], params }).amountCents).toBe(19500)
  })

  it('ignore un minimum absent, nul ou égal à 1 h (pas de minimum)', () => {
    for (const minHours of [null, undefined, 0, 1]) {
      expect(
        priceHourly({
          durationHours: 1,
          rate: { pricePerHourCents: 6500, minHours },
          surcharges: [],
          params,
        }).amountCents,
      ).toBe(6500)
    }
  })

  it('se combine avec les tranches d\'heures supplémentaires (cas « 2 h à 65 €, puis 50 € »)', () => {
    const rate = {
      pricePerHourCents: 6500,
      overtimeAfterHours: 2,
      overtimePricePerHourCents: 5000,
      minHours: 2,
    }
    // 2 h au tarif de base…
    expect(priceHourly({ durationHours: 2, rate, surcharges: [], params }).amountCents).toBe(13000)
    // …puis chaque heure suivante au tarif réduit.
    expect(priceHourly({ durationHours: 4, rate, surcharges: [], params }).amountCents).toBe(23000)
    // …et une demande d'1 h reste refusée.
    expect(() =>
      priceHourly({ durationHours: 1, rate, surcharges: [], params }),
    ).toThrowError(/à partir de 2 h/)
  })
})
