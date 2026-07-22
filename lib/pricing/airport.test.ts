import { describe, expect, it } from 'vitest'
import { priceAirport } from './airport'
import { PricingError } from './transfer'
import type { AirportRates } from '../airport'
import type { DriverPricingParams } from './types'

const params: DriverPricingParams = {
  currency: 'eur',
  minimumFareCents: 2500, // 25 €
  timezone: 'Europe/Paris',
}

const rates: AirportRates = {
  orlyRiveDroiteCents: 6500,
  orlyRiveGaucheCents: 6000,
  cdgRiveDroiteCents: 8500,
  cdgRiveGaucheCents: 9000,
  kmRateCents: 110, // 1,10 €/km hors Paris
}

describe('priceAirport — forfaits Paris intra-muros', () => {
  it('applique le forfait du couple aéroport × rive', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'RIVE_DROITE' },
      rates,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(6500)
    expect(r.currency).toBe('eur')
    expect(r.breakdown).toHaveLength(1)
    expect(r.breakdown[0].label).toBe('Transfert aéroport — Orly → Rive droite')
    expect(r.breakdown[0].detail).toContain('forfait')
  })

  it('le même forfait vaut dans les deux sens (libellé inversé)', () => {
    const aller = priceAirport({
      selection: { hub: 'cdg', direction: 'FROM_AIRPORT', zone: 'RIVE_GAUCHE' },
      rates,
      surcharges: [],
      params,
    })
    const retour = priceAirport({
      selection: { hub: 'cdg', direction: 'TO_AIRPORT', zone: 'RIVE_GAUCHE' },
      rates,
      surcharges: [],
      params,
    })
    expect(aller.amountCents).toBe(9000)
    expect(retour.amountCents).toBe(9000)
    expect(aller.breakdown[0].label).toContain('Roissy CDG → Rive gauche')
    expect(retour.breakdown[0].label).toContain('Rive gauche → Roissy CDG')
  })

  it('le forfait est un prix fixe : le minimum de course ne le remonte pas', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'RIVE_GAUCHE' },
      rates: { ...rates, orlyRiveGaucheCents: 2000 }, // 20 € < minimum 25 €
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(2000)
    expect(r.breakdown).toHaveLength(1)
  })

  it('la distance est ignorée pour un forfait (aucune ligne au km)', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'TO_AIRPORT', zone: 'RIVE_DROITE' },
      rates,
      distanceMeters: 42_000,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(6500)
    expect(r.breakdown).toHaveLength(1)
  })

  it('refuse un forfait non configuré par le chauffeur', () => {
    expect(() =>
      priceAirport({
        selection: { hub: 'cdg', direction: 'FROM_AIRPORT', zone: 'RIVE_DROITE' },
        rates: { ...rates, cdgRiveDroiteCents: null },
        surcharges: [],
        params,
      }),
    ).toThrowError(PricingError)
  })

  it('ajoute les majorations automatiques au forfait', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'RIVE_DROITE' },
      rates,
      surcharges: [
        { name: 'Majoration dernière minute', kind: 'FIXED', amount: 1000 },
        { name: 'Majoration nuit', kind: 'PERCENT', amount: 1000 }, // 10 %
      ],
      params,
    })
    // 65 € + 10 € + 10 % de 65 € (6,50 €) = 81,50 €
    expect(r.amountCents).toBe(6500 + 1000 + 650)
    expect(r.breakdown).toHaveLength(3)
  })
})

describe('priceAirport — hors Paris (au km)', () => {
  it('facture distance × prix au km', () => {
    const r = priceAirport({
      selection: { hub: 'cdg', direction: 'FROM_AIRPORT', zone: 'HORS_PARIS' },
      rates,
      distanceMeters: 40_000,
      surcharges: [],
      params,
    })
    // 40 km × 1,10 € = 44,00 €
    expect(r.amountCents).toBe(4400)
    expect(r.breakdown[0].label).toBe('Transfert aéroport — Roissy CDG → Hors Paris')
    expect(r.breakdown[0].detail).toContain('40 km')
  })

  it('arrondit au centime le plus proche', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'TO_AIRPORT', zone: 'HORS_PARIS' },
      rates,
      distanceMeters: 33_333, // 33,333 km × 1,10 € = 36,6663 € → 36,67 €
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(3667)
  })

  it('applique le minimum de course quand le calcul au km est trop bas', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'HORS_PARIS' },
      rates,
      distanceMeters: 10_000, // 10 km × 1,10 € = 11 € < 25 €
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(2500)
    expect(r.breakdown[1].label).toBe('Ajustement au minimum de course')
  })

  it('les majorations sont calculées après le minimum de course', () => {
    const r = priceAirport({
      selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'HORS_PARIS' },
      rates,
      distanceMeters: 10_000, // remonté à 25 €
      surcharges: [{ name: 'Majoration', kind: 'PERCENT', amount: 1000 }], // 10 %
      params,
    })
    // 25 € + 10 % de 25 € = 27,50 €
    expect(r.amountCents).toBe(2750)
  })

  it('refuse le hors Paris sans prix au km configuré', () => {
    expect(() =>
      priceAirport({
        selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'HORS_PARIS' },
        rates: { ...rates, kmRateCents: null },
        distanceMeters: 40_000,
        surcharges: [],
        params,
      }),
    ).toThrowError(/hors Paris/)
  })

  it('refuse une distance manquante ou invalide', () => {
    for (const distanceMeters of [undefined, null, 0, -5] as const) {
      expect(() =>
        priceAirport({
          selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'HORS_PARIS' },
          rates,
          distanceMeters,
          surcharges: [],
          params,
        }),
      ).toThrowError(PricingError)
    }
  })
})
