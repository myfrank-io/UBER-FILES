// Détection automatique d'un transfert aéroport à partir des deux adresses d'une
// course. Depuis la fusion des onglets (« Courses »), le client ne déclare plus
// l'aéroport, le sens ni la zone : on les déduit des adresses saisies.
//
// ⚠️ Cette détection est AUTORITAIRE CÔTÉ SERVEUR (server/utils/quote-service.ts) :
// c'est elle qui décide qu'un forfait s'applique. La page publique appelle les
// mêmes fonctions pour afficher le prix en direct — jamais l'inverse (sinon
// n'importe quel client pourrait réclamer le forfait le moins cher).
//
// Trois questions, dans cet ordre :
//   1. un bout du trajet est-il un aéroport tarifé (Orly / Roissy CDG) ?
//   2. dans quel sens (on part de l'aéroport ou on y va) ?
//   3. dans quelle zone se trouve le bout « ville » (rive droite / gauche / hors Paris) ?
// Si le chauffeur ne propose pas ce trajet, on ne renvoie rien : la course
// retombe silencieusement sur la grille kilométrique classique.

import {
  AIRPORT_HUB_IDS,
  airportZoneAvailable,
  type AirportHubId,
  type AirportRates,
  type AirportSelection,
  type AirportZone,
} from './airport'
import { findHubById } from './hubs'

export interface LatLngLike {
  lat: number
  lng: number
}

/** Un bout de trajet tel que saisi : texte de l'adresse et/ou coordonnées résolues. */
export interface RideEndpoint {
  address?: string | null
  coords?: LatLngLike | null
}

export interface AirportDetection {
  selection: AirportSelection
  /** Bout « ville » du trajet — celui dont l'adresse détermine la zone. */
  citySide: 'pickup' | 'dropoff'
}

export interface DetectAirportArgs {
  rates: AirportRates | null | undefined
  pickup: RideEndpoint
  dropoff: RideEndpoint
  /** Un aller-retour n'est jamais au forfait (le forfait couvre un trajet simple). */
  roundTrip?: boolean
}

// ─── Reconnaissance de l'aéroport ───

// Rayon autour du centre de l'aéroport dans lequel une coordonnée est considérée
// « à l'aéroport ». Généreux : les emprises d'Orly et de Roissy sont vastes et
// les communes limitrophes (Orly, Roissy-en-France) relèvent du même forfait.
const HUB_RADIUS_KM: Record<AirportHubId, number> = { cdg: 6, orly: 5 }

// Repli texte, utilisé UNIQUEMENT sans coordonnées. Volontairement plus strict que
// les alias du catalogue : « avenue Charles de Gaulle » existe dans des centaines
// de communes et ne doit surtout pas déclencher un forfait aéroport.
const HUB_TEXT_PATTERNS: Record<AirportHubId, RegExp[]> = {
  cdg: [/\broissy\b/, /\bcdg\b/, /\b(aeroport|airport)[\s-]+(paris[\s-]+)?charles[\s-]de[\s-]gaulle\b/],
  orly: [/\borly\b/, /\bory\b/],
}

/** Minuscules sans accents, pour comparer du texte saisi librement. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Centre de l'aéroport = moyenne des points de prise en charge de ses terminaux. */
function hubCenter(id: AirportHubId): LatLngLike | null {
  const hub = findHubById(id)
  if (!hub || !hub.terminals.length) return null
  const lat = hub.terminals.reduce((s, t) => s + t.lat, 0) / hub.terminals.length
  const lng = hub.terminals.reduce((s, t) => s + t.lng, 0) / hub.terminals.length
  return { lat, lng }
}

/** Distance approchée (km) entre deux points — suffisante à l'échelle d'une région. */
function distanceKm(a: LatLngLike, b: LatLngLike): number {
  const dLat = (a.lat - b.lat) * 110.574
  const dLng = (a.lng - b.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/**
 * L'aéroport tarifé correspondant à ce bout de trajet, ou null.
 * Les coordonnées font foi quand elles existent (une adresse choisie dans
 * l'autocomplétion en fournit toujours) ; le texte n'est qu'un repli.
 */
export function detectAirportHub(endpoint: RideEndpoint): AirportHubId | null {
  if (endpoint.coords) {
    let best: { id: AirportHubId; km: number } | null = null
    for (const id of AIRPORT_HUB_IDS) {
      const center = hubCenter(id)
      if (!center) continue
      const km = distanceKm(endpoint.coords, center)
      if (km <= HUB_RADIUS_KM[id] && (!best || km < best.km)) best = { id, km }
    }
    return best?.id ?? null
  }
  if (!endpoint.address) return null
  const text = normalize(endpoint.address)
  for (const id of AIRPORT_HUB_IDS) {
    if (HUB_TEXT_PATTERNS[id].some((re) => re.test(text))) return id
  }
  return null
}

// ─── Zone parisienne (rive droite / rive gauche / hors Paris) ───

// Arrondissements au sud de la Seine. Le 1er et le 4e couvrent les îles
// (Cité, Saint-Louis) : par convention elles sont rattachées à la rive droite.
const RIVE_GAUCHE_POSTAL_CODES = new Set(['75005', '75006', '75007', '75013', '75014', '75015'])

/** Zone déduite d'un code postal parisien présent dans l'adresse — null sinon. */
function zoneFromPostalCode(address: string | null | undefined): AirportZone | null {
  if (!address) return null
  const match = address.match(/\b(75\d{3})\b/)
  if (!match) return null
  const code = match[1]!
  const arrondissement = Number(code.slice(2))
  // 75001–75020, plus le 75116 (16e, seul code « bis » encore en usage).
  const isParis = (arrondissement >= 1 && arrondissement <= 20) || code === '75116'
  if (!isParis) return null
  return RIVE_GAUCHE_POSTAL_CODES.has(code) ? 'RIVE_GAUCHE' : 'RIVE_DROITE'
}

// Contour approximatif de Paris intra-muros (périphérique + bois de Boulogne et
// de Vincennes, qui font administrativement partie de la ville). Sommets en
// [lng, lat]. Précision volontairement grossière : ce test n'est qu'un repli
// quand l'adresse ne porte pas de code postal.
const PARIS_RING: [number, number][] = [
  [2.2823, 48.8781], // Porte Maillot
  [2.2872, 48.8859], // Porte de Champerret
  [2.3010, 48.8890], // Porte d'Asnières
  [2.3130, 48.8945], // Porte de Clichy
  [2.3290, 48.8975], // Porte de Saint-Ouen
  [2.3444, 48.8990], // Porte de Clignancourt
  [2.3595, 48.8990], // Porte de la Chapelle
  [2.3720, 48.8985], // Porte d'Aubervilliers
  [2.3860, 48.8980], // Porte de la Villette
  [2.3930, 48.8905], // Porte de Pantin
  [2.4070, 48.8770], // Porte des Lilas
  [2.4090, 48.8650], // Porte de Bagnolet
  [2.4110, 48.8535], // Porte de Montreuil
  [2.4110, 48.8470], // Porte de Vincennes
  [2.4680, 48.8380], // Bois de Vincennes (est)
  [2.4640, 48.8230], // Bois de Vincennes (sud-est)
  [2.4080, 48.8250], // Porte de Bercy / Charenton
  [2.3700, 48.8215], // Porte d'Ivry
  [2.3590, 48.8190], // Porte d'Italie
  [2.3260, 48.8190], // Porte d'Orléans
  [2.3050, 48.8250], // Porte de Vanves
  [2.2870, 48.8320], // Porte de Versailles
  [2.2760, 48.8355], // Porte de Sèvres
  [2.2720, 48.8395], // Pont du Garigliano
  [2.2560, 48.8380], // Porte de Saint-Cloud
  [2.2270, 48.8480], // Bois de Boulogne (sud-ouest)
  [2.2300, 48.8650], // Bois de Boulogne (ouest)
  [2.2440, 48.8790], // Bois de Boulogne (nord)
  [2.2660, 48.8830], // Porte des Ternes
]

// Tracé de la Seine dans Paris, dans le SENS DU COURANT (sud-est → sud-ouest).
// L'ordre compte : la rive droite est celle qu'on a à sa droite en descendant le
// fleuve, soit — ici — le côté nord/est. Sommets en [lng, lat].
const SEINE_DOWNSTREAM: [number, number][] = [
  [2.4130, 48.8235],
  [2.3960, 48.8290],
  [2.3880, 48.8330],
  [2.3790, 48.8395],
  [2.3660, 48.8447],
  [2.3560, 48.8510],
  [2.3410, 48.8570],
  [2.3300, 48.8610],
  [2.3215, 48.8635],
  [2.3140, 48.8635],
  [2.3010, 48.8635],
  [2.2930, 48.8600],
  [2.2870, 48.8555],
  [2.2820, 48.8500],
  [2.2760, 48.8460],
  [2.2720, 48.8395],
]

// Projection plane locale (mètres) centrée sur Paris : à cette échelle l'erreur
// est négligeable, et les calculs d'orientation deviennent triviaux.
const ORIGIN = { lat: 48.8566, lng: 2.3522 }
const M_PER_DEG_LAT = 110_540
const M_PER_DEG_LNG = 111_320 * Math.cos(ORIGIN.lat * (Math.PI / 180))

function project(point: LatLngLike): { x: number; y: number } {
  return {
    x: (point.lng - ORIGIN.lng) * M_PER_DEG_LNG,
    y: (point.lat - ORIGIN.lat) * M_PER_DEG_LAT,
  }
}

/** Point dans le polygone (lancer de rayon), sommets en [lng, lat]. */
function insidePolygon(point: LatLngLike, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Le point est-il dans Paris intra-muros (bois compris) ? */
export function insideParis(point: LatLngLike): boolean {
  return insidePolygon(point, PARIS_RING)
}

/**
 * Rive d'un point parisien, par rapport au tracé de la Seine : on cherche le
 * segment le plus proche, puis le côté (produit vectoriel) dans le sens du
 * courant. À gauche du courant = rive gauche.
 */
export function seineSide(point: LatLngLike): AirportZone {
  const p = project(point)
  let bestDistance = Infinity
  let bestCross = 0
  for (let i = 0; i < SEINE_DOWNSTREAM.length - 1; i++) {
    const a = project({ lng: SEINE_DOWNSTREAM[i]![0], lat: SEINE_DOWNSTREAM[i]![1] })
    const b = project({ lng: SEINE_DOWNSTREAM[i + 1]![0], lat: SEINE_DOWNSTREAM[i + 1]![1] })
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy || 1
    // Projection du point sur le segment, bornée à ses extrémités.
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const distance = Math.hypot(p.x - projX, p.y - projY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestCross = dx * (p.y - a.y) - dy * (p.x - a.x)
    }
  }
  return bestCross > 0 ? 'RIVE_GAUCHE' : 'RIVE_DROITE'
}

/**
 * Zone tarifaire du bout « ville » d'un transfert aéroport. Le code postal
 * parisien fait foi quand l'adresse en porte un (les adresses issues de
 * l'autocomplétion en portent presque toujours) ; sinon on tranche
 * géométriquement. Tout ce qui n'est pas dans Paris est « hors Paris ».
 */
export function detectParisZone(endpoint: RideEndpoint): AirportZone {
  const byPostalCode = zoneFromPostalCode(endpoint.address)
  if (byPostalCode) return byPostalCode
  if (endpoint.coords && insideParis(endpoint.coords)) return seineSide(endpoint.coords)
  return 'HORS_PARIS'
}

// ─── Détection complète ───

/**
 * Le trajet est-il un transfert aéroport tarifé ? Renvoie la sélection
 * (aéroport, sens, zone) à appliquer, ou null pour une course classique.
 *
 * Renvoie null — donc grille kilométrique classique — quand :
 *   • aucun bout n'est un aéroport tarifé (ou les deux le sont : aucun forfait
 *     « ville » n'a de sens sur un Orly → Roissy) ;
 *   • c'est un aller-retour (le forfait couvre un trajet simple) ;
 *   • le chauffeur ne propose pas ce trajet-là (forfait de la zone non renseigné,
 *     ou prix au km manquant hors Paris).
 */
export function detectAirportRide(args: DetectAirportArgs): AirportDetection | null {
  if (!args.rates || args.roundTrip) return null
  const pickupHub = detectAirportHub(args.pickup)
  const dropoffHub = detectAirportHub(args.dropoff)
  if (Boolean(pickupHub) === Boolean(dropoffHub)) return null

  const hub = (pickupHub ?? dropoffHub)!
  const citySide = pickupHub ? 'dropoff' : 'pickup'
  const zone = detectParisZone(pickupHub ? args.dropoff : args.pickup)
  if (!airportZoneAvailable(args.rates, hub, zone)) return null

  return {
    selection: {
      hub,
      direction: pickupHub ? 'FROM_AIRPORT' : 'TO_AIRPORT',
      zone,
    },
    citySide,
  }
}
