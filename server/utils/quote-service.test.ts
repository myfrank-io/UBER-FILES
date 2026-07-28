import { describe, it, expect, vi } from 'vitest'
import type { Surcharge } from '@prisma/client'
import { applicableSurcharges, computeQuote, type DriverWithPricing } from './quote-service'

// Le trajet Google n'est pas appelé dans les tests : distance et durée sont fixées.
vi.mock('./google-maps', () => ({
  computeRoute: vi.fn(async () => ({
    distanceMeters: 20_000,
    durationSeconds: 1_800,
    estimated: false,
  })),
}))

function surcharge(over: Partial<Surcharge>): Surcharge {
  return {
    id: 's1',
    driverId: 'd1',
    name: 'Majoration',
    kind: 'FIXED',
    amount: 2000,
    autoApply: true,
    maxLeadTimeMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Surcharge
}

describe('applicableSurcharges', () => {
  it('ignore les majorations non automatiques', () => {
    const list = [surcharge({ autoApply: false })]
    expect(applicableSurcharges(list, 30)).toEqual([])
  })

  it("applique toujours une majoration sans fenêtre de délai", () => {
    const list = [surcharge({ name: 'Aéroport' })]
    expect(applicableSurcharges(list, 99999)).toHaveLength(1)
  })

  it("applique la majoration dernière minute sous le seuil (ex : +20 € à moins de 2 h)", () => {
    const list = [surcharge({ name: 'Dernière minute', maxLeadTimeMinutes: 120 })]
    expect(applicableSurcharges(list, 90)).toEqual([
      { name: 'Dernière minute', kind: 'FIXED', amount: 2000 },
    ])
  })

  it("ne l'applique pas au seuil exact ni au-delà", () => {
    const list = [surcharge({ maxLeadTimeMinutes: 120 })]
    expect(applicableSurcharges(list, 120)).toEqual([])
    expect(applicableSurcharges(list, 300)).toEqual([])
  })

  it('gère plusieurs paliers indépendants', () => {
    const list = [
      surcharge({ id: 'a', name: '+10 € < 6 h', amount: 1000, maxLeadTimeMinutes: 360 }),
      surcharge({ id: 'b', name: '+20 € < 2 h', amount: 2000, maxLeadTimeMinutes: 120 }),
    ]
    // À 90 min du départ : les deux paliers s'appliquent.
    expect(applicableSurcharges(list, 90)).toHaveLength(2)
    // À 3 h : seul le palier < 6 h s'applique.
    expect(applicableSurcharges(list, 180).map((s) => s.name)).toEqual(['+10 € < 6 h'])
  })
})

// ─── Reconnaissance automatique des transferts aéroport ───
// Depuis la fusion des onglets, le client n'envoie plus que deux adresses : c'est
// le moteur de devis qui reconnaît un trajet aéroport et applique le bon tarif.

function pricingDriver(over: Partial<DriverWithPricing> = {}): DriverWithPricing {
  return {
    currency: 'EUR',
    minimumFareCents: 2000,
    timezone: 'Europe/Paris',
    minLeadTimeMinutes: 180,
    surcharges: [],
    passengerSurcharge3Cents: null,
    passengerSurcharge4Cents: null,
    hourlyRateCents: null,
    hourlyOvertimeAfterHours: null,
    hourlyOvertimeRateCents: null,
    hourlyOvertime2AfterHours: null,
    hourlyOvertime2RateCents: null,
    airportOrlyRiveDroiteCents: 6500,
    airportOrlyRiveGaucheCents: 6000,
    airportCdgRiveDroiteCents: 8000,
    airportCdgRiveGaucheCents: 8500,
    airportKmRateCents: 220,
    transferBands: [
      {
        name: 'Standard',
        pricePerKmCents: 300,
        tiers: [],
        daysOfWeek: [],
        startMinute: null,
        endMinute: null,
        priority: 0,
        isDefault: true,
      },
    ],
    ...over,
  } as unknown as DriverWithPricing
}

const ORLY = { lat: 48.7269, lng: 2.3625 }
const CDG = { lat: 49.0079, lng: 2.5508 }
const MONTPARNASSE = { lat: 48.8422, lng: 2.3219 }
const LOUVRE = { lat: 48.8606, lng: 2.3376 }
const scheduledAt = new Date('2026-09-15T10:00:00Z')

describe('computeQuote — transfert aéroport reconnu automatiquement', () => {
  it('applique le forfait de la rive au départ d’un aéroport', async () => {
    const result = await computeQuote({
      driver: pricingDriver(),
      type: 'TRANSFER',
      scheduledAt,
      pickup: ORLY,
      dropoff: MONTPARNASSE,
      pickupAddress: 'Aéroport Paris-Orly',
      dropoffAddress: '5 rue Daguerre, 75014 Paris',
    })
    expect(result.airport).toEqual({ hub: 'orly', direction: 'FROM_AIRPORT', zone: 'RIVE_GAUCHE' })
    expect(result.price.amountCents).toBe(6000)
  })

  it("applique le forfait dans l'autre sens", async () => {
    const result = await computeQuote({
      driver: pricingDriver(),
      type: 'TRANSFER',
      scheduledAt,
      pickup: LOUVRE,
      dropoff: CDG,
      pickupAddress: '10 rue de Rivoli, 75004 Paris',
      dropoffAddress: 'Aéroport Paris-Charles de Gaulle',
    })
    expect(result.airport).toEqual({ hub: 'cdg', direction: 'TO_AIRPORT', zone: 'RIVE_DROITE' })
    expect(result.price.amountCents).toBe(8000)
  })

  it('facture au km aéroport hors Paris', async () => {
    const result = await computeQuote({
      driver: pricingDriver(),
      type: 'TRANSFER',
      scheduledAt,
      pickup: ORLY,
      dropoff: { lat: 48.8014, lng: 2.1301 },
      pickupAddress: 'Aéroport Paris-Orly',
      dropoffAddress: 'Château de Versailles, 78000 Versailles',
    })
    expect(result.airport?.zone).toBe('HORS_PARIS')
    // 20 km × 2,20 € — et non la grille classique à 3,00 €/km.
    expect(result.price.amountCents).toBe(4400)
  })

  it('garde la grille kilométrique sur une course sans aéroport', async () => {
    const result = await computeQuote({
      driver: pricingDriver(),
      type: 'TRANSFER',
      scheduledAt,
      pickup: LOUVRE,
      dropoff: MONTPARNASSE,
      pickupAddress: '10 rue de Rivoli, 75004 Paris',
      dropoffAddress: '5 rue Daguerre, 75014 Paris',
    })
    expect(result.airport).toBeUndefined()
    expect(result.price.amountCents).toBe(6000) // 20 km × 3,00 €
  })

  it('ne force pas le forfait sur un aller-retour', async () => {
    const result = await computeQuote({
      driver: pricingDriver(),
      type: 'TRANSFER',
      scheduledAt,
      pickup: ORLY,
      dropoff: MONTPARNASSE,
      pickupAddress: 'Aéroport Paris-Orly',
      dropoffAddress: '5 rue Daguerre, 75014 Paris',
      roundTrip: true,
    })
    expect(result.airport).toBeUndefined()
  })

  it('retombe sur la grille classique quand le chauffeur ne propose pas ce forfait', async () => {
    const result = await computeQuote({
      driver: pricingDriver({ airportOrlyRiveGaucheCents: null } as Partial<DriverWithPricing>),
      type: 'TRANSFER',
      scheduledAt,
      pickup: ORLY,
      dropoff: MONTPARNASSE,
      pickupAddress: 'Aéroport Paris-Orly',
      dropoffAddress: '5 rue Daguerre, 75014 Paris',
    })
    expect(result.airport).toBeUndefined()
    expect(result.price.amountCents).toBe(6000) // 20 km × 3,00 €
  })
})
