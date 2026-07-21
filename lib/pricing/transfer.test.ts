import { describe, expect, it } from 'vitest'
import { priceTransfer, PricingError } from './transfer'
import type { DriverPricingParams, TransferRateBandInput } from './types'

const params: DriverPricingParams = {
  currency: 'eur',
  minimumFareCents: 1000, // 10 € — assez bas pour ne pas masquer les calculs de base
  timezone: 'Europe/Paris',
}

// Bandes : jour 06h→22h à 2,00 €/km ; nuit 22h→06h à 3,00 €/km (chevauche minuit).
const bands: TransferRateBandInput[] = [
  {
    name: 'Jour',
    pricePerKmCents: 200,
    daysOfWeek: [],
    startMinute: 6 * 60,
    endMinute: 22 * 60,
    priority: 1,
    isDefault: true,
  },
  {
    name: 'Nuit',
    pricePerKmCents: 300,
    daysOfWeek: [],
    startMinute: 22 * 60,
    endMinute: 22 * 60 + 8 * 60, // 1320 → 1800 (06h)
    priority: 2,
    isDefault: false,
  },
]

describe('priceTransfer', () => {
  it('applique le tarif de jour pour une course en journée', () => {
    // 14h00 Paris (été = UTC+2) -> 12h00 UTC
    const at = new Date('2026-06-15T12:00:00Z')
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [],
      params,
    })
    // 10 km × 2,00 € = 20,00 €
    expect(r.amountCents).toBe(2000)
    expect(r.breakdown[0].label).toContain('Jour')
  })

  it('applique le tarif de nuit (bande chevauchant minuit)', () => {
    // 23h00 Paris (été) -> 21h00 UTC
    const at = new Date('2026-06-15T21:00:00Z')
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [],
      params,
    })
    // 10 km × 3,00 € = 30,00 €
    expect(r.amountCents).toBe(3000)
    expect(r.breakdown[0].label).toContain('Nuit')
  })

  it('applique le tarif de nuit juste après minuit', () => {
    // 02h00 Paris (été) -> 00h00 UTC
    const at = new Date('2026-06-15T00:00:00Z')
    const r = priceTransfer({
      distanceMeters: 5_000,
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(1500) // 5 km × 3,00 € = 15,00 €
  })

  it('double la distance pour un aller-retour', () => {
    const at = new Date('2026-06-15T12:00:00Z')
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: at,
      roundTrip: true,
      bands,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(4000) // 20 km × 2,00 €
  })

  it('applique le prix minimum de course', () => {
    const at = new Date('2026-06-15T12:00:00Z')
    const r = priceTransfer({
      distanceMeters: 2_000, // 2 km × 2,00 € = 4,00 € < 10,00 € minimum
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(1000)
    expect(r.breakdown.some((l) => l.label.includes('minimum'))).toBe(true)
  })

  it('applique une majoration fixe', () => {
    const at = new Date('2026-06-15T12:00:00Z')
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [{ name: 'Supplément aéroport', kind: 'FIXED', amount: 500 }],
      params,
    })
    expect(r.amountCents).toBe(2500) // 2000 + 500
  })

  it('applique une majoration en pourcentage sur le sous-total', () => {
    const at = new Date('2026-06-15T12:00:00Z')
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [{ name: 'Jour férié', kind: 'PERCENT', amount: 1000 }], // +10 %
      params,
    })
    expect(r.amountCents).toBe(2200) // 2000 + 10 %
  })

  it('calcule le pourcentage après application du minimum', () => {
    const at = new Date('2026-06-15T12:00:00Z')
    const r = priceTransfer({
      distanceMeters: 1_000, // sous le minimum
      scheduledAt: at,
      roundTrip: false,
      bands,
      surcharges: [{ name: 'Férié', kind: 'PERCENT', amount: 1000 }],
      params,
    })
    expect(r.amountCents).toBe(1100) // minimum 1000 + 10 %
  })

  it('rejette une distance nulle', () => {
    expect(() =>
      priceTransfer({
        distanceMeters: 0,
        scheduledAt: new Date(),
        roundTrip: false,
        bands,
        surcharges: [],
        params,
      }),
    ).toThrow(PricingError)
  })

  it('rejette une grille vide', () => {
    expect(() =>
      priceTransfer({
        distanceMeters: 1000,
        scheduledAt: new Date(),
        roundTrip: false,
        bands: [],
        surcharges: [],
        params,
      }),
    ).toThrow(PricingError)
  })

  // Grille dégressive type de la demande : 0→21 km à 2,00 €, 21→70 km à
  // 1,70 €, au-delà de 70 km à 1,10 €. Barème progressif : chaque kilomètre
  // est facturé au tarif de sa tranche.
  const tieredBands: TransferRateBandInput[] = [
    {
      name: 'Jour',
      pricePerKmCents: 200,
      tiers: [
        { uptoKm: 21, pricePerKmCents: 200 },
        { uptoKm: 70, pricePerKmCents: 170 },
        { uptoKm: null, pricePerKmCents: 110 },
      ],
      daysOfWeek: [],
      startMinute: 0,
      endMinute: 1440,
      priority: 1,
      isDefault: true,
    },
  ]
  const at = new Date('2026-06-15T12:00:00Z')

  it('facture au tarif de la première tranche une course courte', () => {
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: at,
      roundTrip: false,
      bands: tieredBands,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(2000) // 10 km × 2,00 €
    expect(r.breakdown).toHaveLength(1)
  })

  it('découpe une course à cheval sur deux tranches', () => {
    const r = priceTransfer({
      distanceMeters: 30_000,
      scheduledAt: at,
      roundTrip: false,
      bands: tieredBands,
      surcharges: [],
      params,
    })
    // 21 km × 2,00 € + 9 km × 1,70 € = 42,00 € + 15,30 €
    expect(r.amountCents).toBe(5730)
    expect(r.breakdown).toHaveLength(2)
    expect(r.breakdown[0].label).toContain('Jour')
    expect(r.breakdown[0].amountCents).toBe(4200)
    expect(r.breakdown[1].label).toBe('De 21 à 70 km')
    expect(r.breakdown[1].amountCents).toBe(1530)
  })

  it('découpe une course longue sur les trois tranches', () => {
    const r = priceTransfer({
      distanceMeters: 100_000,
      scheduledAt: at,
      roundTrip: false,
      bands: tieredBands,
      surcharges: [],
      params,
    })
    // 21 × 2,00 + 49 × 1,70 + 30 × 1,10 = 42,00 + 83,30 + 33,00
    expect(r.amountCents).toBe(15830)
    expect(r.breakdown).toHaveLength(3)
    expect(r.breakdown[2].label).toBe('Au-delà de 70 km')
    expect(r.breakdown[2].amountCents).toBe(3300)
  })

  it('garantit un prix qui ne baisse jamais au passage d’un seuil', () => {
    const price = (meters: number) =>
      priceTransfer({
        distanceMeters: meters,
        scheduledAt: at,
        roundTrip: false,
        bands: tieredBands,
        surcharges: [],
        params,
      }).amountCents
    expect(price(71_000)).toBeGreaterThan(price(69_000))
    expect(price(21_500)).toBeGreaterThan(price(20_900))
  })

  it('applique la grille à la distance totale d’un aller-retour', () => {
    const r = priceTransfer({
      distanceMeters: 15_000,
      scheduledAt: at,
      roundTrip: true,
      bands: tieredBands,
      surcharges: [],
      params,
    })
    // 2 × 15 km = 30 km facturés : 21 × 2,00 + 9 × 1,70
    expect(r.amountCents).toBe(5730)
  })

  it('gère une distance fractionnaire par tranche', () => {
    const r = priceTransfer({
      distanceMeters: 30_500,
      scheduledAt: at,
      roundTrip: false,
      bands: tieredBands,
      surcharges: [],
      params,
    })
    // 21 × 2,00 + 9,5 × 1,70 = 42,00 + 16,15
    expect(r.amountCents).toBe(5815)
  })

  it('retrie des tranches reçues dans le désordre', () => {
    const shuffled: TransferRateBandInput[] = [
      {
        ...tieredBands[0],
        tiers: [
          { uptoKm: null, pricePerKmCents: 110 },
          { uptoKm: 21, pricePerKmCents: 200 },
          { uptoKm: 70, pricePerKmCents: 170 },
        ],
      },
    ]
    const r = priceTransfer({
      distanceMeters: 100_000,
      scheduledAt: at,
      roundTrip: false,
      bands: shuffled,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(15830)
  })

  it('traite la dernière tranche comme illimitée même si elle est bornée', () => {
    const capped: TransferRateBandInput[] = [
      {
        ...tieredBands[0],
        tiers: [
          { uptoKm: 21, pricePerKmCents: 200 },
          { uptoKm: 70, pricePerKmCents: 170 },
        ],
      },
    ]
    const r = priceTransfer({
      distanceMeters: 100_000,
      scheduledAt: at,
      roundTrip: false,
      bands: capped,
      surcharges: [],
      params,
    })
    // 21 × 2,00 + 79 × 1,70 : les km au-delà de 70 restent au tarif du dernier palier
    expect(r.amountCents).toBe(17630)
  })

  it('applique le prix minimum de course aussi avec une grille', () => {
    const r = priceTransfer({
      distanceMeters: 2_000, // 2 km × 2,00 € = 4,00 € < 10,00 €
      scheduledAt: at,
      roundTrip: false,
      bands: tieredBands,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(1000)
  })

  it('utilise la bande par défaut si aucune ne correspond à l’heure', () => {
    const restrictedBands: TransferRateBandInput[] = [
      {
        name: 'Créneau matinal',
        pricePerKmCents: 250,
        daysOfWeek: [],
        startMinute: 6 * 60,
        endMinute: 9 * 60,
        priority: 1,
        isDefault: true,
      },
    ]
    // 15h00 Paris -> hors plage, mais isDefault -> on l'utilise
    const r = priceTransfer({
      distanceMeters: 10_000,
      scheduledAt: new Date('2026-06-15T13:00:00Z'),
      roundTrip: false,
      bands: restrictedBands,
      surcharges: [],
      params,
    })
    expect(r.amountCents).toBe(2500)
  })
})
