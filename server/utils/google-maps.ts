// Service Google Maps Platform — appelé UNIQUEMENT côté serveur (la clé n'est jamais
// exposée au navigateur). Couvre Places Autocomplete et Routes (distance/durée).
// Repli : si aucune clé n'est configurée, on estime via la formule de haversine pour
// rester développable/testable sans clé.
import { allowedMapsUrl, parseMapsPlaceUrl } from '~/lib/place-search'

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

export interface LiveRouteResult extends RouteResult {
  // Polyline encodée Google du tracé — absente en repli haversine (la carte
  // client trace alors une ligne droite).
  encodedPolyline?: string
}

/**
 * Variante « suivi de course » de computeRoute : même appel Routes (trafic
 * inclus) mais avec le tracé de l'itinéraire en plus, pour la carte client.
 * Un seul appel par recalcul d'ETA — le tracé ne coûte rien de plus.
 */
export async function computeLiveRoute(
  from: LatLng,
  to: LatLng,
  apiKey: string | undefined,
): Promise<LiveRouteResult> {
  if (!apiKey) return haversineRoute(from, to)

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  })
  if (!res.ok) return haversineRoute(from, to)

  const data = (await res.json()) as {
    routes?: {
      distanceMeters?: number
      duration?: string
      polyline?: { encodedPolyline?: string }
    }[]
  }
  const route = data.routes?.[0]
  if (!route?.distanceMeters) return haversineRoute(from, to)

  const durationSeconds = route.duration ? parseInt(route.duration.replace('s', ''), 10) : 0
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds,
    estimated: false,
    encodedPolyline: route.polyline?.encodedPolyline,
  }
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

export interface PlaceSummary {
  placeId: string
  name: string
  address: string
}

// Biais géographique France métropolitaine pour les recherches d'établissement :
// sans lui, l'API pondère les résultats par l'IP de l'appelant — or nos fonctions
// Vercel tournent à Francfort, ce qui enterre les petites fiches françaises
// (surtout celles en zone de chalandise, sans adresse visible). C'est un biais,
// pas un filtre : rien n'est exclu hors du rectangle (DOM-TOM incluables via
// regionCode FR conservé).
const FRANCE_LOCATION_BIAS = {
  rectangle: {
    low: { latitude: 41.3, longitude: -5.2 },
    high: { latitude: 51.1, longitude: 9.6 },
  },
}

/**
 * Recherche d'ÉTABLISSEMENTS par nom (Places Text Search) — utilisée par le
 * chauffeur pour retrouver sa fiche Google et en dériver le lien d'avis.
 * `near` resserre le biais autour d'un point (ex. coordonnées extraites d'un
 * lien Maps partagé) — sinon biais France entière. Contrairement à
 * l'autocomplétion d'adresses, pas de repli sans clé : la BAN ne connaît pas
 * les établissements (l'appelant gère l'absence de clé).
 */
export async function searchPlaces(
  query: string,
  apiKey: string,
  near?: LatLng,
): Promise<PlaceSummary[]> {
  const locationBias = near
    ? { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30_000 } }
    : FRANCE_LOCATION_BIAS
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'fr',
      regionCode: 'FR',
      locationBias,
      pageSize: 5,
    }),
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string }[]
  }
  return (data.places ?? [])
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.id && p?.displayName?.text))
    .map((p) => ({ placeId: p.id!, name: p.displayName!.text!, address: p.formattedAddress ?? '' }))
}

/**
 * Second filet de la recherche d'établissement : l'AUTOCOMPLÉTION Places. Son
 * algorithme de correspondance (préfixes, tolérance aux variantes de nom) est
 * différent de Text Search et retrouve souvent les fiches « zone de
 * chalandise » (sans adresse visible) que Text Search rate. Appelée par
 * l'endpoint de recherche quand Text Search ne renvoie rien.
 */
export async function autocompleteEstablishments(
  query: string,
  apiKey: string,
): Promise<PlaceSummary[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input: query,
      languageCode: 'fr',
      regionCode: 'FR',
      locationBias: FRANCE_LOCATION_BIAS,
    }),
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string
        text?: { text?: string }
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
      }
    }[]
  }
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId!,
      // mainText = nom de la fiche, secondaryText = localité ; repli sur le
      // libellé complet si le format structuré manque.
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      address: p.structuredFormat?.secondaryText?.text ?? '',
    }))
    .filter((p) => p.name)
    .slice(0, 5)
}

/**
 * Résout un lien de partage Google Maps collé par le chauffeur (maps.app.goo.gl,
 * g.page, google.com/maps…) en candidats de fiche : on suit les redirections
 * UNIQUEMENT pour des hôtes Google connus (allowedMapsUrl, anti-SSRF), on
 * extrait nom + coordonnées de l'URL finale, puis Text Search resserré autour
 * du point. Chemin de secours pour les fiches que la recherche par nom rate
 * (zone de chalandise) : partager sa fiche depuis l'app Maps est un geste
 * simple, contrairement au lien d'avis caché dans la console Google Business.
 */
export async function resolveMapsShareUrl(
  rawUrl: string,
  apiKey: string,
): Promise<PlaceSummary[]> {
  const url = allowedMapsUrl(rawUrl)
  if (!url) return []

  let finalUrl = url.toString()
  try {
    const res = await fetch(finalUrl, { redirect: 'follow', signal: AbortSignal.timeout(5000) })
    if (res.url) finalUrl = res.url
    // Seule l'URL finale nous intéresse — on libère la connexion sans lire le corps.
    void res.body?.cancel()
  } catch {
    // Lien lent ou mort : on tente le décodage de l'URL telle quelle.
  }

  // Après redirections, on doit toujours être chez Google (chaîne de confiance).
  try {
    const landed = new URL(finalUrl)
    // Depuis une IP européenne (nos fonctions Vercel), Google intercale souvent
    // sa page de consentement : la vraie URL Maps est dans le paramètre continue.
    if (landed.hostname.startsWith('consent.google.')) {
      finalUrl = landed.searchParams.get('continue') ?? finalUrl
    }
    if (!/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$|(^|\.)goo\.gl$|(^|\.)g\.page$/.test(new URL(finalUrl).hostname)) {
      return []
    }
  } catch {
    return []
  }

  const hint = parseMapsPlaceUrl(finalUrl)
  if (!hint.name) return []
  const near = hint.lat != null && hint.lng != null ? { lat: hint.lat, lng: hint.lng } : undefined
  const results = await searchPlaces(hint.name, apiKey, near)
  if (results.length > 0) return results
  return autocompleteEstablishments(hint.name, apiKey)
}

/**
 * Nom + adresse canoniques d'une fiche via Place Details. Sert à valider un
 * placeId soumis par le client et à stocker des instantanés d'affichage sûrs
 * (on ne fait jamais confiance au libellé envoyé par le navigateur).
 */
export async function getPlaceSummary(
  placeId: string,
  apiKey: string,
): Promise<PlaceSummary | null> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress',
        'Accept-Language': 'fr',
      },
    },
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    id?: string
    displayName?: { text?: string }
    formattedAddress?: string
  }
  if (!data.id || !data.displayName?.text) return null
  return { placeId: data.id, name: data.displayName.text, address: data.formattedAddress ?? '' }
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
