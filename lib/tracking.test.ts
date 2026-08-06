import { describe, expect, it } from 'vitest'
import {
  bearingDegrees,
  decodePolyline,
  etaMinutesLeft,
  isLivePhase,
  isPositionLive,
  positionAgeSeconds,
  ridePhase,
  straightDistanceMeters,
} from './tracking'

describe('ridePhase', () => {
  const base = { status: 'CONFIRMED', departedAt: null, arrivedAt: null, pickedUpAt: null }

  it('suit la progression des étapes horodatées', () => {
    expect(ridePhase(base)).toBe('UPCOMING')
    expect(ridePhase({ ...base, departedAt: new Date() })).toBe('EN_ROUTE')
    expect(ridePhase({ ...base, departedAt: new Date(), arrivedAt: new Date() })).toBe('ARRIVED')
    expect(
      ridePhase({ ...base, departedAt: new Date(), arrivedAt: new Date(), pickedUpAt: new Date() }),
    ).toBe('ON_BOARD')
  })

  it('le statut terminal prime sur les étapes', () => {
    expect(ridePhase({ ...base, status: 'COMPLETED', pickedUpAt: new Date() })).toBe('COMPLETED')
    expect(ridePhase({ ...base, status: 'CANCELLED', departedAt: new Date() })).toBe('CANCELLED')
  })

  it('une course non confirmée reste UPCOMING même avec des étapes', () => {
    expect(ridePhase({ ...base, status: 'PENDING_PAYMENT', departedAt: new Date() })).toBe('UPCOMING')
  })

  it('tolère les étapes sérialisées en chaînes (payload JSON)', () => {
    expect(ridePhase({ status: 'CONFIRMED', departedAt: '2026-08-05T10:00:00Z' })).toBe('EN_ROUTE')
  })
})

describe('isLivePhase', () => {
  it('vrai uniquement entre le départ et la fin de course', () => {
    expect(isLivePhase('UPCOMING')).toBe(false)
    expect(isLivePhase('EN_ROUTE')).toBe(true)
    expect(isLivePhase('ARRIVED')).toBe(true)
    expect(isLivePhase('ON_BOARD')).toBe(true)
    expect(isLivePhase('COMPLETED')).toBe(false)
    expect(isLivePhase('CANCELLED')).toBe(false)
  })
})

describe('bearingDegrees', () => {
  it('0° vers le nord, ~90° vers l’est, ~180° vers le sud, ~270° vers l’ouest', () => {
    const paris = { lat: 48.8566, lng: 2.3522 }
    expect(bearingDegrees(paris, { lat: 49.8566, lng: 2.3522 })).toBeCloseTo(0, 0)
    expect(bearingDegrees(paris, { lat: 48.8566, lng: 3.3522 })).toBeCloseTo(90, 0)
    expect(bearingDegrees(paris, { lat: 47.8566, lng: 2.3522 })).toBeCloseTo(180, 0)
    expect(bearingDegrees(paris, { lat: 48.8566, lng: 1.3522 })).toBeCloseTo(270, 0)
  })

  it('reste dans [0, 360)', () => {
    const b = bearingDegrees({ lat: 48.85, lng: 2.35 }, { lat: 48.86, lng: 2.34 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})

describe('straightDistanceMeters', () => {
  it('distance nulle sur le même point', () => {
    const p = { lat: 48.8566, lng: 2.3522 }
    expect(straightDistanceMeters(p, p)).toBe(0)
  })

  it('Paris → Orly ≈ 14 km à vol d’oiseau', () => {
    const d = straightDistanceMeters({ lat: 48.8566, lng: 2.3522 }, { lat: 48.7262, lng: 2.3652 })
    expect(d).toBeGreaterThan(13_000)
    expect(d).toBeLessThan(16_000)
  })
})

describe('decodePolyline', () => {
  it('décode l’exemple de référence Google en ordre [lng, lat]', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
  })

  it('chaîne vide → aucun point', () => {
    expect(decodePolyline('')).toEqual([])
  })
})

describe('positions & ETA', () => {
  const now = new Date('2026-08-05T10:00:00Z')

  it('positionAgeSeconds : âge en secondes, null sans position', () => {
    expect(positionAgeSeconds(null, now)).toBeNull()
    expect(positionAgeSeconds('2026-08-05T09:59:00Z', now)).toBe(60)
    // Une horloge légèrement en avance ne produit pas d'âge négatif.
    expect(positionAgeSeconds('2026-08-05T10:00:05Z', now)).toBe(0)
  })

  it('isPositionLive : fraîche sous 90 s', () => {
    expect(isPositionLive('2026-08-05T09:59:00Z', now)).toBe(true)
    expect(isPositionLive('2026-08-05T09:57:00Z', now)).toBe(false)
    expect(isPositionLive(null, now)).toBe(false)
  })

  it('etaMinutesLeft : arrondi supérieur, plancher 0, null sans ETA', () => {
    expect(etaMinutesLeft(null, now)).toBeNull()
    expect(etaMinutesLeft('2026-08-05T10:07:30Z', now)).toBe(8)
    expect(etaMinutesLeft('2026-08-05T09:50:00Z', now)).toBe(0)
  })
})
