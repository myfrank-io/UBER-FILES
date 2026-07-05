// Service Google Maps Platform — appelé UNIQUEMENT côté serveur (la clé n'est jamais
// exposée au navigateur). Couvre Places Autocomplete et Routes (distance/durée).
// Repli : si aucune clé n'est configurée, on estime via la formule de haversine pour
// rester développable/testable sans clé.

export interface RouteResult {
  distanceMeters: number
  durationSeconds: number
  estimated: boolean // true = repli haversine (pas d'appel Google)
}

export interface PlacePrediction {
  description: string
  placeId: string
  // Coordonnées déjà connues (repli BAN). Absentes pour Google (résolues via
  // Place Details au moment de la sélection).
  lat?: number
  lng?: number
}

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000

/** Distance à vol d'oiseau, majorée d'un facteur de sinuosité urbaine (~1,4). */
export function haversineRoute(from: LatLng, to: LatLng): RouteResult {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  const straight = 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
  const roadFactor = 1.4
  const distanceMeters = Math.round(straight * roadFactor)
  // Vitesse moyenne urbaine ~30 km/h.
  const durationSeconds = Math.round((distanceMeters / 1000 / 30) * 3600)
  return { distanceMeters, durationSeconds, estimated: true }
}

/** Calcule distance + durée via l'API Routes (ou repli haversine sans clé). */
export async function computeRoute(
  from: LatLng,
  to: LatLng,
  apiKey: string | undefined,
): Promise<RouteResult> {
  if (!apiKey) return haversineRoute(from, to)

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  })

  if (!res.ok) {
    // En cas d'échec API, on dégrade proprement plutôt que de bloquer le devis.
    return haversineRoute(from, to)
  }

  const data = (await res.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[]
  }
  const route = data.routes?.[0]
  if (!route?.distanceMeters) return haversineRoute(from, to)

  // duration au format "1234s"
  const durationSeconds = route.duration ? parseInt(route.duration.replace('s', ''), 10) : 0
  return { distanceMeters: route.distanceMeters, durationSeconds, estimated: false }
}

/**
 * Autocomplétion d'adresse. Utilise Google Places si une clé est configurée,
 * sinon se rabat sur la Base Adresse Nationale (api-adresse.data.gouv.fr) —
 * gratuite et sans clé — pour fournir des suggestions dynamiques en dev/démo
 * comme en production tant que Google n'est pas branché.
 */
export async function autocompletePlaces(
  input: string,
  apiKey: string | undefined,
): Promise<PlacePrediction[]> {
  if (input.trim().length < 3) return []
  if (!apiKey) return autocompleteBan(input)

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input,
      languageCode: 'fr',
      regionCode: 'FR',
    }),
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    suggestions?: { placePrediction?: { text?: { text?: string }; placeId?: string } }[]
  }
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId && p?.text?.text))
    .map((p) => ({ description: p.text!.text!, placeId: p.placeId! }))
}

/**
 * Repli d'autocomplétion sans clé via la Base Adresse Nationale (data.gouv.fr).
 * Gratuit, sans authentification, optimisé pour les adresses françaises.
 */
async function autocompleteBan(input: string): Promise<PlacePrediction[]> {
  const url = `https://api-adresse.data.gouv.fr/search/?limit=5&q=${encodeURIComponent(input)}`
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'vtc-booking/1.0' } })
  } catch {
    return []
  }
  if (!res.ok) return []
  const data = (await res.json()) as {
    features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string; id?: string } }[]
  }
  return (data.features ?? [])
    .filter((f): f is typeof f & { properties: { label: string; id: string } } =>
      Boolean(f.properties?.label && f.properties?.id),
    )
    .map((f) => ({
      description: f.properties.label,
      placeId: f.properties.id,
      // BAN renvoie [longitude, latitude] : on expose directement les coordonnées.
      ...(f.geometry?.coordinates
        ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }
        : {}),
    }))
}

/**
 * Géocode une adresse libre en coordonnées. Utilise Google Geocoding si une clé est
 * configurée, sinon se rabat sur OpenStreetMap Nominatim (sans clé) — ce qui permet
 * de faire fonctionner tout le flux en dev/démo sans Google.
 */
export async function geocodeAddress(
  address: string,
  apiKey: string | undefined,
): Promise<(LatLng & { formatted: string }) | null> {
  if (apiKey) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&region=fr&key=${apiKey}`
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as {
        results?: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[]
      }
      const r = data.results?.[0]
      if (r) return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address }
    }
    return null
  }
  // Repli sans clé via la Base Adresse Nationale (même source que l'autocomplétion).
  const url = `https://api-adresse.data.gouv.fr/search/?limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'vtc-booking/1.0' } })
  if (!res.ok) return null
  const data = (await res.json()) as {
    features?: { geometry?: { coordinates?: [number, number] }; properties?: { label?: string } }[]
  }
  const r = data.features?.[0]
  const coords = r?.geometry?.coordinates
  if (!r || !coords) return null
  // BAN renvoie [longitude, latitude].
  return { lat: coords[1], lng: coords[0], formatted: r.properties?.label ?? address }
}

/** Récupère les coordonnées d'un placeId via Place Details. */
export async function geocodePlace(
  placeId: string,
  apiKey: string | undefined,
): Promise<LatLng | null> {
  if (!apiKey) return null
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'location',
      },
    },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { location?: { latitude: number; longitude: number } }
  if (!data.location) return null
  return { lat: data.location.latitude, lng: data.location.longitude }
}
