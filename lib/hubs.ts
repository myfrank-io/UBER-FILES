// Catalogue des grands hubs français (aéroports & gares) — structure du « Niveau 2 »
// de précision des localisations. Chaque hub liste ses terminaux/halls avec la
// coordonnée du POINT DE PRISE EN CHARGE VTC officiel (zone VTC dédiée), plus fiable
// que le centroïde renvoyé par un géocodage générique.
//
// Utilisation prévue (à brancher ensuite) : quand le lieu choisi correspond à un hub
// connu, proposer au client un sélecteur de terminal ; la coordonnée retenue est
// alors celle du terminal (pickup VTC), et le terminal est stocké sur la demande
// (RideRequest.pickupTerminal) pour être affiché au chauffeur.

export type HubKind = 'AIRPORT' | 'STATION'

export interface HubTerminal {
  /** Code court affiché/stocké (ex: "2E", "T1", "Hall 2"). */
  code: string
  /** Libellé lisible (ex: "Terminal 2E — Hall L"). */
  label: string
  /** Coordonnée du point de prise en charge VTC de ce terminal. */
  lat: number
  lng: number
}

export interface Hub {
  /** Identifiant interne stable (ex: "cdg", "orly", "gare-de-lyon"). */
  id: string
  kind: HubKind
  /** Nom affiché (ex: "Aéroport Paris-Charles de Gaulle"). */
  name: string
  /** Code IATA (aéroport) ou code gare, pour l'affichage. */
  code?: string
  /** Fragments de texte permettant de reconnaître le hub dans une adresse choisie. */
  aliases: string[]
  terminals: HubTerminal[]
  /**
   * true = coordonnées confirmées sur une source officielle (zone VTC ADP /
   * Gares & Connexion). false = valeurs APPROXIMATIVES (centroïde du bâtiment
   * terminal, de mémoire) à ne pas considérer comme exactes au mètre.
   */
  verified: boolean
  /** Provenance des coordonnées (pour la traçabilité). */
  source: string
}

// ⚠️ FIABILITÉ DES COORDONNÉES
// Les points ci-dessous sont APPROXIMATIFS (centroïdes de bâtiments terminaux,
// verified:false) — utilisables pour aiguiller, mais PAS les zones de prise en
// charge VTC officielles au mètre près. Pour fiabiliser, remplacer par les points
// publiés officiellement puis passer verified:true :
//   • CDG / Orly / Beauvais : Groupe ADP — zones VTC par terminal
//     (parisaeroport.fr → « accès / VTC »)
//   • Gares : SNCF Gares & Connexion — dépose-minute / stations VTC
// Note : lorsque GOOGLE_MAPS_API_KEY est configurée, choisir « Terminal … » dans
// l'autocomplétion résout déjà des coordonnées précises via Place Details ; ce
// catalogue sert surtout de repli (sans clé Google) et à l'UX du sélecteur.
export const HUBS: Hub[] = [
  {
    id: 'cdg',
    kind: 'AIRPORT',
    name: 'Aéroport Paris-Charles de Gaulle',
    code: 'CDG',
    aliases: ['charles de gaulle', 'roissy', 'cdg', 'aeroport cdg'],
    verified: false,
    source: 'Approx. centroïdes terminaux — à confirmer sur ADP (zones VTC)',
    terminals: [
      { code: 'T1', label: 'Terminal 1', lat: 49.0093, lng: 2.5416 },
      { code: 'T2A', label: 'Terminal 2A', lat: 49.0043, lng: 2.5601 },
      { code: 'T2C', label: 'Terminal 2C', lat: 49.0031, lng: 2.5566 },
      { code: 'T2D', label: 'Terminal 2D', lat: 49.0058, lng: 2.5546 },
      { code: 'T2E', label: 'Terminal 2E', lat: 49.0053, lng: 2.5713 },
      { code: 'T2F', label: 'Terminal 2F', lat: 49.0074, lng: 2.5647 },
      { code: 'T2G', label: 'Terminal 2G (navette)', lat: 48.9906, lng: 2.6047 },
      { code: 'T3', label: 'Terminal 3', lat: 48.9989, lng: 2.5487 },
    ],
  },
  {
    id: 'orly',
    kind: 'AIRPORT',
    name: 'Aéroport Paris-Orly',
    code: 'ORY',
    aliases: ['orly', 'ory', 'aeroport orly'],
    verified: false,
    source: 'Approx. centroïdes terminaux — à confirmer sur ADP (zones VTC)',
    terminals: [
      { code: 'O1', label: 'Orly 1 (ex-Ouest)', lat: 48.7286, lng: 2.3593 },
      { code: 'O2', label: 'Orly 2 (ex-Ouest)', lat: 48.7274, lng: 2.3607 },
      { code: 'O3', label: 'Orly 3 (ex-Sud)', lat: 48.7253, lng: 2.3639 },
      { code: 'O4', label: 'Orly 4 (ex-Sud)', lat: 48.7261, lng: 2.3659 },
    ],
  },
  {
    id: 'beauvais',
    kind: 'AIRPORT',
    name: 'Aéroport Paris-Beauvais',
    code: 'BVA',
    aliases: ['beauvais', 'bva', 'tille'],
    verified: false,
    source: 'Approx. — à confirmer sur le site de l’aéroport de Beauvais',
    terminals: [
      { code: 'T1', label: 'Terminal 1', lat: 49.4553, lng: 2.1136 },
      { code: 'T2', label: 'Terminal 2', lat: 49.4539, lng: 2.1122 },
    ],
  },
  {
    id: 'gare-de-lyon',
    kind: 'STATION',
    name: 'Gare de Lyon',
    aliases: ['gare de lyon'],
    verified: false,
    source: 'Approx. — à confirmer sur SNCF Gares & Connexion (dépose/VTC)',
    terminals: [
      { code: 'HALL1', label: 'Hall 1 (côté Diderot)', lat: 48.8445, lng: 2.3735 },
      { code: 'HALL2', label: 'Hall 2 (côté Van Gogh)', lat: 48.8433, lng: 2.3760 },
    ],
  },
  {
    id: 'gare-du-nord',
    kind: 'STATION',
    name: 'Gare du Nord',
    aliases: ['gare du nord'],
    verified: false,
    source: 'Approx. — à confirmer sur SNCF Gares & Connexion (dépose/VTC)',
    terminals: [{ code: 'PRINCIPALE', label: 'Entrée principale (rue de Dunkerque)', lat: 48.8809, lng: 2.3553 }],
  },
  {
    id: 'montparnasse',
    kind: 'STATION',
    name: 'Gare Montparnasse',
    aliases: ['montparnasse'],
    verified: false,
    source: 'Approx. — à confirmer sur SNCF Gares & Connexion (dépose/VTC)',
    terminals: [{ code: 'PRINCIPALE', label: 'Entrée principale (bd de Vaugirard)', lat: 48.8403, lng: 2.3199 }],
  },
]

/** Normalise une chaîne pour la comparaison (minuscules, sans accents). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Reconnaît un hub à partir d'un texte d'adresse choisi (ou null si aucun). */
export function findHubByText(text: string | null | undefined): Hub | null {
  if (!text) return null
  const t = normalize(text)
  return HUBS.find((h) => h.aliases.some((a) => t.includes(normalize(a)))) ?? null
}

/** Retrouve un hub par son identifiant interne ("orly", "cdg"…). */
export function findHubById(id: string | null | undefined): Hub | null {
  if (!id) return null
  return HUBS.find((h) => h.id === id) ?? null
}

/** Retrouve un terminal par son code dans un hub. */
export function findTerminal(hub: Hub, code: string | null | undefined): HubTerminal | null {
  if (!code) return null
  return hub.terminals.find((t) => t.code === code) ?? null
}

/**
 * Libellé lisible du terminal choisi (ex: « Terminal 2E »), à partir de l'adresse
 * de départ et du code stocké. Renvoie le code brut si le hub n'est pas reconnu,
 * ou null si aucun terminal.
 */
export function terminalLabel(
  address: string | null | undefined,
  terminalCode: string | null | undefined,
): string | null {
  if (!terminalCode) return null
  const hub = findHubByText(address)
  const terminal = hub ? findTerminal(hub, terminalCode) : null
  return terminal?.label ?? terminalCode
}

/**
 * Adresse de prise en charge enrichie du terminal choisi, pour l'affichage au
 * chauffeur : « Aéroport CDG · Terminal 2E ». Renvoie l'adresse inchangée si aucun
 * terminal (ou hub non reconnu).
 */
export function pickupWithTerminal(
  address: string | null | undefined,
  terminalCode: string | null | undefined,
): string {
  const base = address ?? ''
  if (!terminalCode) return base
  const hub = findHubByText(address)
  const terminal = hub ? findTerminal(hub, terminalCode) : null
  const label = terminal?.label ?? terminalCode
  return base ? `${base} · ${label}` : label
}
