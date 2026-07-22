import { describe, expect, it } from 'vitest'
import {
  airportHubAvailable,
  airportLabelFromRide,
  airportPackageCents,
  airportRatesFromDriver,
  airportRideLabel,
  airportTransferEnabled,
  airportZoneAvailable,
  type AirportRates,
} from './airport'

const empty: AirportRates = {
  orlyRiveDroiteCents: null,
  orlyRiveGaucheCents: null,
  cdgRiveDroiteCents: null,
  cdgRiveGaucheCents: null,
  kmRateCents: null,
}

describe('airportPackageCents', () => {
  const rates: AirportRates = {
    orlyRiveDroiteCents: 6500,
    orlyRiveGaucheCents: 6000,
    cdgRiveDroiteCents: 8500,
    cdgRiveGaucheCents: 9000,
    kmRateCents: 110,
  }

  it('retourne le forfait du bon couple aéroport × rive', () => {
    expect(airportPackageCents(rates, 'orly', 'RIVE_DROITE')).toBe(6500)
    expect(airportPackageCents(rates, 'orly', 'RIVE_GAUCHE')).toBe(6000)
    expect(airportPackageCents(rates, 'cdg', 'RIVE_DROITE')).toBe(8500)
    expect(airportPackageCents(rates, 'cdg', 'RIVE_GAUCHE')).toBe(9000)
  })

  it('ne retourne jamais de forfait pour le hors Paris (tarifé au km)', () => {
    expect(airportPackageCents(rates, 'orly', 'HORS_PARIS')).toBeNull()
    expect(airportPackageCents(rates, 'cdg', 'HORS_PARIS')).toBeNull()
  })
})

describe('disponibilité (zones, aéroports, onglet)', () => {
  it('rien de configuré : rien de réservable, onglet masqué', () => {
    expect(airportZoneAvailable(empty, 'orly', 'RIVE_DROITE')).toBe(false)
    expect(airportHubAvailable(empty, 'orly')).toBe(false)
    expect(airportTransferEnabled(empty)).toBe(false)
  })

  it('un seul forfait : seuls son aéroport et sa zone sont réservables', () => {
    const rates = { ...empty, orlyRiveGaucheCents: 6000 }
    expect(airportZoneAvailable(rates, 'orly', 'RIVE_GAUCHE')).toBe(true)
    expect(airportZoneAvailable(rates, 'orly', 'RIVE_DROITE')).toBe(false)
    expect(airportHubAvailable(rates, 'orly')).toBe(true)
    expect(airportHubAvailable(rates, 'cdg')).toBe(false)
    expect(airportTransferEnabled(rates)).toBe(true)
  })

  it('prix au km seul : le hors Paris est réservable depuis les deux aéroports', () => {
    const rates = { ...empty, kmRateCents: 110 }
    expect(airportZoneAvailable(rates, 'orly', 'HORS_PARIS')).toBe(true)
    expect(airportZoneAvailable(rates, 'cdg', 'HORS_PARIS')).toBe(true)
    expect(airportZoneAvailable(rates, 'orly', 'RIVE_DROITE')).toBe(false)
    expect(airportHubAvailable(rates, 'orly')).toBe(true)
    expect(airportTransferEnabled(rates)).toBe(true)
  })
})

describe('airportRideLabel', () => {
  it('suit le sens choisi par le client', () => {
    expect(
      airportRideLabel({ hub: 'orly', direction: 'FROM_AIRPORT', zone: 'RIVE_DROITE' }),
    ).toBe('Orly → Rive droite')
    expect(
      airportRideLabel({ hub: 'cdg', direction: 'TO_AIRPORT', zone: 'HORS_PARIS' }),
    ).toBe('Hors Paris → Roissy CDG')
  })
})

describe('airportLabelFromRide', () => {
  it('reconstruit le libellé depuis une demande stockée', () => {
    expect(
      airportLabelFromRide({
        airportHub: 'orly',
        airportDirection: 'TO_AIRPORT',
        airportZone: 'RIVE_DROITE',
      }),
    ).toBe('Rive droite → Orly')
  })

  it('retourne null pour une course classique ou des données invalides', () => {
    expect(
      airportLabelFromRide({ airportHub: null, airportDirection: null, airportZone: null }),
    ).toBeNull()
    expect(
      airportLabelFromRide({
        airportHub: 'beauvais', // hub non proposé sur l'onglet aéroport
        airportDirection: 'FROM_AIRPORT',
        airportZone: 'RIVE_DROITE',
      }),
    ).toBeNull()
  })
})

describe('airportRatesFromDriver', () => {
  it('mappe les colonnes du chauffeur vers la grille', () => {
    expect(
      airportRatesFromDriver({
        airportOrlyRiveDroiteCents: 1,
        airportOrlyRiveGaucheCents: 2,
        airportCdgRiveDroiteCents: 3,
        airportCdgRiveGaucheCents: 4,
        airportKmRateCents: 5,
      }),
    ).toEqual({
      orlyRiveDroiteCents: 1,
      orlyRiveGaucheCents: 2,
      cdgRiveDroiteCents: 3,
      cdgRiveGaucheCents: 4,
      kmRateCents: 5,
    })
  })
})
