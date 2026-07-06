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
}

// NB : coordonnées indicatives des zones VTC — à affiner avec les points officiels
// avant exploitation. La structure prime ici sur l'exactitude au mètre.
export const HUBS: Hub[] = [
  {
    id: 'cdg',
    kind: 'AIRPORT',
    name: 'Aéroport Paris-Charles de Gaulle',
    code: 'CDG',
    aliases: ['charles de gaulle', 'roissy', 'cdg'],
    terminals: [
      { code: 'T1', label: 'Terminal 1', lat: 49.0097, lng: 2.5479 },
      { code: 'T2A', label: 'Terminal 2A', lat: 49.0040, lng: 2.5620 },
      { code: 'T2C', label: 'Terminal 2C', lat: 49.0035, lng: 2.5610 },
      { code: 'T2E', label: 'Terminal 2E', lat: 49.0056, lng: 2.5700 },
      { code: 'T2F', label: 'Terminal 2F', lat: 49.0059, lng: 2.5645 },
      { code: 'T3', label: 'Terminal 3', lat: 48.9990, lng: 2.5560 },
    ],
  },
  {
    id: 'orly',
    kind: 'AIRPORT',
    name: 'Aéroport Paris-Orly',
    code: 'ORY',
    aliases: ['orly', 'ory'],
    terminals: [
      { code: 'O1', label: 'Orly 1', lat: 48.7290, lng: 2.3610 },
      { code: 'O2', label: 'Orly 2', lat: 48.7280, lng: 2.3630 },
      { code: 'O3', label: 'Orly 3', lat: 48.7255, lng: 2.3660 },
      { code: 'O4', label: 'Orly 4', lat: 48.7268, lng: 2.3680 },
    ],
  },
  {
    id: 'beauvais',
    kind: 'AIRPORT',
    name: 'Aéroport Paris-Beauvais',
    code: 'BVA',
    aliases: ['beauvais', 'bva', 'tille'],
    terminals: [
      { code: 'T1', label: 'Terminal 1', lat: 49.4560, lng: 2.1140 },
      { code: 'T2', label: 'Terminal 2', lat: 49.4545, lng: 2.1120 },
    ],
  },
  {
    id: 'gare-de-lyon',
    kind: 'STATION',
    name: 'Gare de Lyon',
    aliases: ['gare de lyon'],
    terminals: [
      { code: 'HALL1', label: 'Hall 1 (dépose Diderot)', lat: 48.8447, lng: 2.3745 },
      { code: 'HALL2', label: 'Hall 2 (Van Gogh)', lat: 48.8430, lng: 2.3760 },
    ],
  },
  {
    id: 'gare-du-nord',
    kind: 'STATION',
    name: 'Gare du Nord',
    aliases: ['gare du nord'],
    terminals: [{ code: 'PRINCIPALE', label: 'Entrée principale (rue de Dunkerque)', lat: 48.8809, lng: 2.3553 }],
  },
  {
    id: 'montparnasse',
    kind: 'STATION',
    name: 'Gare Montparnasse',
    aliases: ['montparnasse'],
    terminals: [{ code: 'PRINCIPALE', label: 'Entrée principale (bd de Vaugirard)', lat: 48.8404, lng: 2.3200 }],
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

/** Retrouve un terminal par son code dans un hub. */
export function findTerminal(hub: Hub, code: string | null | undefined): HubTerminal | null {
  if (!code) return null
  return hub.terminals.find((t) => t.code === code) ?? null
}
