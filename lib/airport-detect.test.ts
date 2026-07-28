import { describe, expect, it } from 'vitest'
import {
  detectAirportHub,
  detectAirportRide,
  detectParisZone,
  insideParis,
  seineSide,
} from './airport-detect'
import type { AirportRates } from './airport'

// Coordonnées de référence (approximatives, suffisantes pour ces tests).
const CDG = { lat: 49.0079, lng: 2.5508 }
const ORLY = { lat: 48.7269, lng: 2.3625 }
const BEAUVAIS = { lat: 49.4544, lng: 2.1128 }
const TOUR_EIFFEL = { lat: 48.8584, lng: 2.2945 }
const MONTMARTRE = { lat: 48.8867, lng: 2.3431 }
const LOUVRE = { lat: 48.8606, lng: 2.3376 }
const MONTPARNASSE = { lat: 48.8422, lng: 2.3219 }
const BERCY = { lat: 48.8390, lng: 2.3830 }
const NEUILLY = { lat: 48.8850, lng: 2.2690 }
const BOULOGNE = { lat: 48.8350, lng: 2.2400 }
const VERSAILLES = { lat: 48.8014, lng: 2.1301 }

const fullRates: AirportRates = {
  orlyRiveDroiteCents: 6500,
  orlyRiveGaucheCents: 6000,
  cdgRiveDroiteCents: 8000,
  cdgRiveGaucheCents: 8500,
  kmRateCents: 220,
}

describe('detectAirportHub', () => {
  it('reconnaît un aéroport tarifé par ses coordonnées', () => {
    expect(detectAirportHub({ coords: CDG })).toBe('cdg')
    expect(detectAirportHub({ coords: ORLY })).toBe('orly')
  })

  it('ignore une adresse parisienne ou un aéroport sans grille', () => {
    expect(detectAirportHub({ coords: LOUVRE })).toBeNull()
    expect(detectAirportHub({ coords: BEAUVAIS, address: 'Aéroport Paris-Beauvais' })).toBeNull()
  })

  it("les coordonnées priment sur le texte de l'adresse", () => {
    // « Avenue Charles de Gaulle » existe à Neuilly : le point fait foi.
    expect(detectAirportHub({ address: '1 avenue Charles de Gaulle, Neuilly', coords: NEUILLY })).toBeNull()
  })

  it("retombe sur le texte quand aucune coordonnée n'est résolue", () => {
    expect(detectAirportHub({ address: 'Aéroport Paris-Charles de Gaulle, Terminal 2E' })).toBe('cdg')
    expect(detectAirportHub({ address: 'Roissy-en-France' })).toBe('cdg')
    expect(detectAirportHub({ address: "Aéroport d'Orly, Orly 4" })).toBe('orly')
  })

  it('ne déclenche pas sur une avenue Charles de Gaulle sans coordonnées', () => {
    expect(detectAirportHub({ address: '12 avenue Charles de Gaulle, 92200 Neuilly-sur-Seine' })).toBeNull()
  })
})

describe('insideParis', () => {
  it('accepte les adresses intra-muros (bois compris)', () => {
    expect(insideParis(TOUR_EIFFEL)).toBe(true)
    expect(insideParis(MONTMARTRE)).toBe(true)
    expect(insideParis(BERCY)).toBe(true)
  })

  it('rejette la petite couronne', () => {
    expect(insideParis(NEUILLY)).toBe(false)
    expect(insideParis(BOULOGNE)).toBe(false)
    expect(insideParis(VERSAILLES)).toBe(false)
    expect(insideParis(CDG)).toBe(false)
  })
})

describe('seineSide', () => {
  it('place correctement les repères de chaque rive', () => {
    expect(seineSide(TOUR_EIFFEL)).toBe('RIVE_GAUCHE')
    expect(seineSide(MONTPARNASSE)).toBe('RIVE_GAUCHE')
    expect(seineSide(LOUVRE)).toBe('RIVE_DROITE')
    expect(seineSide(MONTMARTRE)).toBe('RIVE_DROITE')
  })
})

describe('detectParisZone', () => {
  it('déduit la rive du code postal quand il est présent', () => {
    expect(detectParisZone({ address: '10 rue de Rivoli, 75004 Paris, France' })).toBe('RIVE_DROITE')
    expect(detectParisZone({ address: '5 rue Daguerre, 75014 Paris' })).toBe('RIVE_GAUCHE')
    expect(detectParisZone({ address: '1 avenue de Wagram, 75017 Paris' })).toBe('RIVE_DROITE')
    expect(detectParisZone({ address: '2 rue Boileau, 75116 Paris' })).toBe('RIVE_DROITE')
  })

  it('retombe sur la géométrie sans code postal', () => {
    expect(detectParisZone({ address: 'Tour Eiffel, Paris', coords: TOUR_EIFFEL })).toBe('RIVE_GAUCHE')
    expect(detectParisZone({ address: 'Sacré-Cœur, Paris', coords: MONTMARTRE })).toBe('RIVE_DROITE')
  })

  it('classe hors Paris tout ce qui est en dehors du périphérique', () => {
    expect(detectParisZone({ address: '3 rue de Longchamp, 92200 Neuilly', coords: NEUILLY })).toBe('HORS_PARIS')
    expect(detectParisZone({ address: 'Château de Versailles', coords: VERSAILLES })).toBe('HORS_PARIS')
    // Ni code postal ni coordonnées : rien ne prouve qu'on est dans Paris.
    expect(detectParisZone({ address: 'quelque part' })).toBe('HORS_PARIS')
  })
})

describe('detectAirportRide', () => {
  const pickupAirport = {
    rates: fullRates,
    pickup: { address: 'Aéroport Paris-Orly', coords: ORLY },
    dropoff: { address: '5 rue Daguerre, 75014 Paris', coords: MONTPARNASSE },
  }

  it("déduit l'aéroport, le sens et la zone d'un départ aéroport", () => {
    expect(detectAirportRide(pickupAirport)).toEqual({
      selection: { hub: 'orly', direction: 'FROM_AIRPORT', zone: 'RIVE_GAUCHE' },
      citySide: 'dropoff',
    })
  })

  it("déduit le sens inverse quand l'aéroport est à l'arrivée", () => {
    expect(
      detectAirportRide({
        rates: fullRates,
        pickup: { address: '10 rue de Rivoli, 75004 Paris', coords: LOUVRE },
        dropoff: { address: 'Aéroport Paris-Charles de Gaulle', coords: CDG },
      }),
    ).toEqual({
      selection: { hub: 'cdg', direction: 'TO_AIRPORT', zone: 'RIVE_DROITE' },
      citySide: 'pickup',
    })
  })

  it('tarife au km hors Paris', () => {
    expect(
      detectAirportRide({
        rates: fullRates,
        pickup: { address: 'Aéroport Paris-Orly', coords: ORLY },
        dropoff: { address: 'Château de Versailles', coords: VERSAILLES },
      })?.selection.zone,
    ).toBe('HORS_PARIS')
  })

  it('ne détecte rien sur une course sans aéroport', () => {
    expect(
      detectAirportRide({
        rates: fullRates,
        pickup: { address: 'Louvre', coords: LOUVRE },
        dropoff: { address: 'Montmartre', coords: MONTMARTRE },
      }),
    ).toBeNull()
  })

  it('ne détecte rien entre deux aéroports (aucun bout « ville »)', () => {
    expect(
      detectAirportRide({
        rates: fullRates,
        pickup: { address: 'Aéroport Paris-Orly', coords: ORLY },
        dropoff: { address: 'Aéroport Paris-Charles de Gaulle', coords: CDG },
      }),
    ).toBeNull()
  })

  it("ne détecte rien sur un aller-retour (le forfait couvre l'aller simple)", () => {
    expect(detectAirportRide({ ...pickupAirport, roundTrip: true })).toBeNull()
  })

  it('retombe sur la grille classique quand le chauffeur ne propose pas ce trajet', () => {
    const noLeftBank: AirportRates = { ...fullRates, orlyRiveGaucheCents: null }
    expect(detectAirportRide({ ...pickupAirport, rates: noLeftBank })).toBeNull()
    // Hors Paris sans prix au km : idem.
    expect(
      detectAirportRide({
        rates: { ...fullRates, kmRateCents: null },
        pickup: { address: 'Aéroport Paris-Orly', coords: ORLY },
        dropoff: { address: 'Château de Versailles', coords: VERSAILLES },
      }),
    ).toBeNull()
  })

  it('ne détecte rien sans grille aéroport', () => {
    expect(detectAirportRide({ ...pickupAirport, rates: null })).toBeNull()
  })
})
