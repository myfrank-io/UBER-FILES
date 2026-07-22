// Domaine des transferts aéroport : forfaits fixes Orly/Roissy ↔ Paris intra-muros
// (rive droite / rive gauche, valables dans les deux sens) et prix au km hors Paris.
// Partagé entre la page publique, les réglages chauffeur et le moteur de devis —
// les identifiants d'aéroport sont ceux du catalogue lib/hubs.ts.

export const AIRPORT_HUB_IDS = ['orly', 'cdg'] as const
export type AirportHubId = (typeof AIRPORT_HUB_IDS)[number]

export const AIRPORT_ZONES = ['RIVE_DROITE', 'RIVE_GAUCHE', 'HORS_PARIS'] as const
export type AirportZone = (typeof AIRPORT_ZONES)[number]

export type AirportDirection = 'FROM_AIRPORT' | 'TO_AIRPORT'

/** Choix complet du client sur l'onglet Aéroport. */
export interface AirportSelection {
  hub: AirportHubId
  direction: AirportDirection
  zone: AirportZone
}

/**
 * Grille aéroport d'un chauffeur. null = non proposé. Un forfait couvre les deux
 * sens (aller comme retour) ; le prix au km ne concerne que la zone HORS_PARIS.
 */
export interface AirportRates {
  orlyRiveDroiteCents: number | null
  orlyRiveGaucheCents: number | null
  cdgRiveDroiteCents: number | null
  cdgRiveGaucheCents: number | null
  kmRateCents: number | null
}

/** Noms courts, compréhensibles d'un coup d'œil (« Roissy CDG » plutôt que le nom complet). */
export const AIRPORT_HUB_LABELS: Record<AirportHubId, string> = {
  orly: 'Orly',
  cdg: 'Roissy CDG',
}

export const AIRPORT_ZONE_LABELS: Record<AirportZone, string> = {
  RIVE_DROITE: 'Rive droite',
  RIVE_GAUCHE: 'Rive gauche',
  HORS_PARIS: 'Hors Paris',
}

/** Extrait la grille aéroport depuis les colonnes du chauffeur (Prisma ou payload API). */
export function airportRatesFromDriver(d: {
  airportOrlyRiveDroiteCents: number | null
  airportOrlyRiveGaucheCents: number | null
  airportCdgRiveDroiteCents: number | null
  airportCdgRiveGaucheCents: number | null
  airportKmRateCents: number | null
}): AirportRates {
  return {
    orlyRiveDroiteCents: d.airportOrlyRiveDroiteCents,
    orlyRiveGaucheCents: d.airportOrlyRiveGaucheCents,
    cdgRiveDroiteCents: d.airportCdgRiveDroiteCents,
    cdgRiveGaucheCents: d.airportCdgRiveGaucheCents,
    kmRateCents: d.airportKmRateCents,
  }
}

/** Forfait (centimes) d'un couple aéroport × rive — null si non proposé ou zone hors Paris. */
export function airportPackageCents(
  rates: AirportRates,
  hub: AirportHubId,
  zone: AirportZone,
): number | null {
  if (zone === 'HORS_PARIS') return null
  if (hub === 'orly') {
    return zone === 'RIVE_DROITE' ? rates.orlyRiveDroiteCents : rates.orlyRiveGaucheCents
  }
  return zone === 'RIVE_DROITE' ? rates.cdgRiveDroiteCents : rates.cdgRiveGaucheCents
}

/** Une zone est réservable si son forfait est défini (rives) ou si le prix au km l'est (hors Paris). */
export function airportZoneAvailable(
  rates: AirportRates,
  hub: AirportHubId,
  zone: AirportZone,
): boolean {
  if (zone === 'HORS_PARIS') return rates.kmRateCents != null
  return airportPackageCents(rates, hub, zone) != null
}

/** Un aéroport est proposé dès qu'au moins une de ses zones est réservable. */
export function airportHubAvailable(rates: AirportRates, hub: AirportHubId): boolean {
  return AIRPORT_ZONES.some((zone) => airportZoneAvailable(rates, hub, zone))
}

/** L'onglet Aéroport n'existe que si au moins un trajet est réservable. */
export function airportTransferEnabled(rates: AirportRates): boolean {
  return AIRPORT_HUB_IDS.some((hub) => airportHubAvailable(rates, hub))
}

/**
 * Libellé du trajet dans le sens choisi (« Orly → Rive gauche », « Hors Paris →
 * Roissy CDG ») — pour les emails, Telegram et le dashboard chauffeur.
 */
export function airportRideLabel(selection: AirportSelection): string {
  const hub = AIRPORT_HUB_LABELS[selection.hub]
  const zone = AIRPORT_ZONE_LABELS[selection.zone]
  return selection.direction === 'FROM_AIRPORT' ? `${hub} → ${zone}` : `${zone} → ${hub}`
}

/**
 * Sélection aéroport d'une demande stockée (champs nullables de RideRequest) —
 * null si course classique ou données incomplètes/inconnues.
 */
export function airportSelectionFromRide(ride: {
  airportHub: string | null
  airportDirection: AirportDirection | null
  airportZone: AirportZone | null
}): AirportSelection | null {
  if (!ride.airportHub || !ride.airportDirection || !ride.airportZone) return null
  if (!(AIRPORT_HUB_IDS as readonly string[]).includes(ride.airportHub)) return null
  return {
    hub: ride.airportHub as AirportHubId,
    direction: ride.airportDirection,
    zone: ride.airportZone,
  }
}

/** Libellé « Orly → Rive gauche » d'une demande stockée — null si course classique. */
export function airportLabelFromRide(ride: {
  airportHub: string | null
  airportDirection: AirportDirection | null
  airportZone: AirportZone | null
}): string | null {
  const selection = airportSelectionFromRide(ride)
  return selection ? airportRideLabel(selection) : null
}
