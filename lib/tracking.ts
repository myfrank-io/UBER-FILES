// Suivi de course jour J — helpers PURS, partagés entre le serveur (webhook
// Telegram, endpoints) et la page client (carte live). Aucune dépendance Nuxt.

/**
 * Phase de la course, dérivée du statut + des étapes horodatées :
 *  UPCOMING  → confirmée, le chauffeur ne s'est pas encore mis en route
 *  EN_ROUTE  → le chauffeur roule vers le lieu de prise en charge
 *  ARRIVED   → le chauffeur attend au point de rendez-vous
 *  ON_BOARD  → client à bord, en route vers la destination
 */
export type RidePhase = 'UPCOMING' | 'EN_ROUTE' | 'ARRIVED' | 'ON_BOARD' | 'COMPLETED' | 'CANCELLED'

export interface TrackedBookingLike {
  status: string
  departedAt?: Date | string | null
  arrivedAt?: Date | string | null
  pickedUpAt?: Date | string | null
}

export function ridePhase(b: TrackedBookingLike): RidePhase {
  if (b.status === 'CANCELLED') return 'CANCELLED'
  if (b.status === 'COMPLETED') return 'COMPLETED'
  if (b.status !== 'CONFIRMED') return 'UPCOMING'
  if (b.pickedUpAt) return 'ON_BOARD'
  if (b.arrivedAt) return 'ARRIVED'
  if (b.departedAt) return 'EN_ROUTE'
  return 'UPCOMING'
}

/** Phases pendant lesquelles le suivi live (position + carte) est actif. */
export function isLivePhase(phase: RidePhase): boolean {
  return phase === 'EN_ROUTE' || phase === 'ARRIVED' || phase === 'ON_BOARD'
}

export interface TrackPoint {
  lat: number
  lng: number
}

const toRad = (d: number) => (d * Math.PI) / 180
const EARTH_RADIUS_M = 6_371_000

/** Distance à vol d'oiseau (haversine), en mètres — sans facteur routier. */
export function straightDistanceMeters(from: TrackPoint, to: TrackPoint): number {
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)))
}

/** Cap initial de A vers B en degrés [0, 360) — 0 = nord, 90 = est. */
export function bearingDegrees(from: TrackPoint, to: TrackPoint): number {
  const φ1 = toRad(from.lat)
  const φ2 = toRad(to.lat)
  const Δλ = toRad(to.lng - from.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

/**
 * Décode une polyline encodée Google (précision 1e-5) en paires [lng, lat] —
 * l'ordre GeoJSON, directement consommable par la carte.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    let byte = 0
    let result = 0
    let shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coords.push([lng / 1e5, lat / 1e5])
  }
  return coords
}

/** Âge d'une position en secondes (null si aucune position). */
export function positionAgeSeconds(
  at: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!at) return null
  return Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 1000))
}

// Telegram met la position en direct à jour toutes les ~10-60 s : au-delà de
// 90 s on affiche « il y a X min » plutôt que « en direct ».
export function isPositionLive(
  at: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const age = positionAgeSeconds(at, now)
  return age != null && age <= 90
}

/** Minutes restantes avant l'ETA (arrondi supérieur, plancher 0) — null sans ETA. */
export function etaMinutesLeft(
  etaAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!etaAt) return null
  return Math.max(0, Math.ceil((new Date(etaAt).getTime() - now.getTime()) / 60_000))
}
