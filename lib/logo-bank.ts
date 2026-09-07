// Banque de logos pour les chauffeurs qui n'en ont pas — logique PURE.
//
// Chaque modèle transforme quelques textes (initiales, nom, sous-titre) en une
// « scène » : une liste de primitives (formes, textes, icônes) dans un repère
// fixe de 1000 × 650 (même ratio que la zone logo des cartes NFC, 40 × 26 mm).
// Le rendu (canvas → PNG transparent) vit dans composables/useLogoRenderer.ts ;
// ici aucune I/O, aucun DOM : tout est testable en Node.
//
// Les couleurs sont des jetons résolus au rendu : `primary` (couleur des
// éléments de la carte), `accent` (cuivre, or…) et `inverse` (fond de la carte,
// pour un texte « découpé » dans une forme pleine).

import { z } from 'zod'

export const LOGO_W = 1000
export const LOGO_H = 650

/**
 * `ink` = la plus sombre des deux couleurs de la carte (éléments / fond) : un
 * diamant noir reste noir sur carte crème, et devient un contour or sur carte noire.
 */
export type LogoColorToken = 'primary' | 'accent' | 'inverse' | 'ink'

/** Polices disponibles au rendu (cf. FONT_STACKS dans le composable). */
export type LogoFont =
  | 'serif' // DM Serif Display
  | 'serifItalic'
  | 'sans' // DM Sans 500
  | 'sansBold' // DM Sans 700
  | 'grotesk' // Space Grotesk 600
  | 'elegant' // Cormorant Garamond 600
  | 'elegantItalic'
  | 'caps' // Cinzel 600

export interface TextItem {
  t: 'text'
  text: string
  x: number
  /** Ligne de base. */
  y: number
  size: number
  font: LogoFont
  color: LogoColorToken
  /** Interlettrage en em (0.2 = 20 % du corps). */
  tracking?: number
  upper?: boolean
  /** Le corps est réduit si le texte dépasse cette largeur. */
  maxWidth?: number
}

export interface ArcTextItem {
  t: 'arcText'
  text: string
  cx: number
  cy: number
  r: number
  size: number
  font: LogoFont
  color: LogoColorToken
  /** Le texte court sur le haut (lecture gauche → droite) ou le bas de l'arc. */
  side: 'top' | 'bottom'
  /** Angle total occupé, en degrés. */
  spread: number
  upper?: boolean
}

export interface CircleItem {
  t: 'circle'
  cx: number
  cy: number
  r: number
  fill?: LogoColorToken
  stroke?: LogoColorToken
  lw?: number
}

export interface PolyItem {
  t: 'poly'
  points: [number, number][]
  fill?: LogoColorToken
  stroke?: LogoColorToken
  lw?: number
  /** Polyligne ouverte (tracé seul) au lieu d'un polygone fermé. */
  open?: boolean
}

export interface LineItem {
  t: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: LogoColorToken
  lw: number
}

export interface PathItem {
  t: 'path'
  /** Chemin SVG dans un repère 0-100. */
  d: string
  x: number
  y: number
  /** Taille (px de scène) du repère 0-100. */
  size: number
  fill?: LogoColorToken
  stroke?: LogoColorToken
  lw?: number
}

export type LogoItem = TextItem | ArcTextItem | CircleItem | PolyItem | LineItem | PathItem

export interface LogoScene {
  w: number
  h: number
  items: LogoItem[]
}

export const LOGO_CATEGORIES = ['diamond', 'monogram', 'type', 'symbol'] as const
export type LogoCategory = (typeof LOGO_CATEGORIES)[number]

export const LOGO_CATEGORY_LABELS: Record<LogoCategory, string> = {
  diamond: 'Diamant',
  monogram: 'Monogramme',
  type: 'Typographique',
  symbol: 'Symbole',
}

export interface LogoInput {
  /** « KD » — deux lettres au plus. */
  initials: string
  /** « Kerkar Drive » ou « Guy Kerkar ». */
  name: string
  /** « Chauffeur Privé ». */
  tagline: string
}

export interface LogoTemplate {
  id: string
  label: string
  category: LogoCategory
  build: (input: LogoInput) => LogoScene
}

/**
 * Couleurs proposées en raccourci dans l'éditeur, pour le texte comme pour
 * l'accent ; une couleur libre reste possible à côté.
 */
export const LOGO_COLOR_PRESETS: { label: string; color: string }[] = [
  { label: 'Or', color: '#C9A24D' },
  { label: 'Cuivre', color: '#B5793F' },
  { label: 'Champagne', color: '#E0B579' },
  { label: 'Argent', color: '#9AA3AD' },
  { label: 'Blanc', color: '#FFFFFF' },
  { label: 'Crème', color: '#F6F1E9' },
  { label: 'Nuit', color: '#0E1B2C' },
  { label: 'Noir', color: '#111111' },
]

export const DEFAULT_LOGO_ACCENT = '#C9A24D'

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format #RRGGBB).')
  .transform((v) => v.toUpperCase())

/**
 * Recette d'un logo généré : tout ce qu'il faut pour le re-rendre à
 * l'identique ou le modifier (modèle, textes, couleurs, effet métal).
 * Enregistrée avec le design ; NULL quand le logo a été importé.
 */
export const logoRecipeSchema = z.object({
  templateId: z.string().min(1).max(40),
  initials: z.string().max(3),
  name: z.string().max(40),
  tagline: z.string().max(40),
  primary: hex,
  accent: hex,
  metallic: z.boolean(),
})

export type LogoRecipe = z.infer<typeof logoRecipeSchema>

/** Recette lisible ou null (JSON d'une ancienne version, champ absent…). */
export function parseLogoRecipe(raw: unknown): LogoRecipe | null {
  const r = logoRecipeSchema.safeParse(raw)
  return r.success && findLogoTemplate(r.data.templateId) ? r.data : null
}

export const DEFAULT_LOGO_TAGLINE = 'Chauffeur Privé'

// ─── Textes dérivés ──────────────────────────────────────────────────────────

/**
 * Initiales d'un nom : première lettre des deux premiers mots (« Kerkar
 * Drive » → « KD », « Guy » → « G »), en capitales, sans accents.
 */
export function deriveInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[\s\-–—_.&/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

/** Premier mot / reste (« Guy Kerkar » → [« Guy », « Kerkar »]). */
export function splitName(name: string): [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return [words[0] ?? '', '']
  return [words[0]!, words.slice(1).join(' ')]
}

/** Normalise les entrées (espaces, initiales bornées à 3 lettres). */
export function normalizeLogoInput(input: Partial<LogoInput>): LogoInput {
  const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  return {
    initials: clean(input.initials).slice(0, 3).toUpperCase(),
    name: clean(input.name),
    tagline: clean(input.tagline),
  }
}

// ─── Géométrie ───────────────────────────────────────────────────────────────

export function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = -90): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = ((rotation + (360 / sides) * i) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

export function starPolygon(cx: number, cy: number, outer: number, inner: number, points = 5): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

// ─── Icônes (repère 0-100) ───────────────────────────────────────────────────

export const LOGO_ICONS = {
  crown: 'M10 78 L10 38 L32 56 L50 22 L68 56 L90 38 L90 78 Z',
  // Diamant taille brillant, vu de profil : table, couronne, rondiste, pavillon.
  // `brilliantBody` = contour fermé (remplissage), `brilliantFacets` = arêtes.
  brilliantBody: 'M30 14 L70 14 L92 40 L50 94 L8 40 Z',
  brilliantFacets:
    'M8 40 L92 40 M30 14 L20 40 M30 14 L40 40 M50 14 L40 40 M50 14 L60 40 M70 14 L60 40 M70 14 L80 40 M20 40 L50 94 M40 40 L50 94 M60 40 L50 94 M80 40 L50 94',
  car: 'M6 64 L12 46 Q20 34 38 33 L62 33 Q78 34 86 44 L94 50 Q97 56 94 64 Z',
  // Vitres de la berline, découpées dans la carrosserie (couleur inverse).
  carWindows: 'M24 46 L30 38 L47 37 L47 46 Z M52 37 L64 37 Q72 38 78 46 L52 46 Z',
  laurelLeft:
    'M50 88 C30 84 18 70 16 50 C24 60 30 62 34 60 C26 54 22 44 24 32 C30 42 36 46 42 46 C36 38 34 28 38 18 C42 30 48 36 54 38',
  laurelRight:
    'M50 88 C70 84 82 70 84 50 C76 60 70 62 66 60 C74 54 78 44 76 32 C70 42 64 46 58 46 C64 38 66 28 62 18 C58 30 52 36 46 38',
} as const

// ─── Modèles ─────────────────────────────────────────────────────────────────

/** Assemble une scène en écartant les textes vides (nom ou sous-titre non renseigné). */
const scene = (items: LogoItem[]): LogoScene => ({
  w: LOGO_W,
  h: LOGO_H,
  items: items.filter((it) => !((it.t === 'text' || it.t === 'arcText') && !it.text.trim())),
})
const CX = LOGO_W / 2

const text = (partial: Omit<TextItem, 't'>): TextItem => ({ t: 'text', ...partial })

/** Sous-titre en petites capitales espacées, centré. */
const tagline = (value: string, y: number, color: LogoColorToken = 'primary', size = 34): TextItem[] =>
  value ? [text({ text: value, x: CX, y, size, font: 'sans', color, tracking: 0.32, upper: true, maxWidth: 900 })] : []

/** Nom en serif capitales espacées, centré. */
const nameCaps = (value: string, y: number, size: number, font: LogoFont = 'serif', tracking = 0.14): TextItem[] =>
  value ? [text({ text: value, x: CX, y, size, font, color: 'primary', tracking, upper: true, maxWidth: 920 })] : []

const rule = (y: number, half: number, color: LogoColorToken = 'accent', lw = 3): LineItem => ({
  t: 'line',
  x1: CX - half,
  y1: y,
  x2: CX + half,
  y2: y,
  stroke: color,
  lw,
})

const icon = (d: string, x: number, y: number, size: number, extra: Partial<PathItem> = {}): PathItem => ({
  t: 'path',
  d,
  x,
  y,
  size,
  fill: 'accent',
  ...extra,
})

/** Petit diamant (contour or) : icône d'ornement réutilisée par la famille « Diamant ». */
const brilliantOutline = (x: number, y: number, size: number, lw = 1.2): PathItem[] => [
  icon(LOGO_ICONS.brilliantBody, x, y, size, { fill: undefined, stroke: 'accent', lw }),
  icon(LOGO_ICONS.brilliantFacets, x, y, size, { fill: undefined, stroke: 'accent', lw: lw * 0.8 }),
]

/** Diamant noir serti : corps sombre, facettes or. */
const brilliantSolid = (x: number, y: number, size: number): PathItem[] => [
  icon(LOGO_ICONS.brilliantBody, x, y, size, { fill: 'ink', stroke: 'accent', lw: 1.4 }),
  icon(LOGO_ICONS.brilliantFacets, x, y, size, { fill: undefined, stroke: 'accent', lw: 1 }),
]

export const LOGO_TEMPLATES: LogoTemplate[] = [
  // ═══ Diamant — la famille « black premium » : diamant à facettes, or, serif fin ═══
  {
    // Diamant noir serti des initiales dorées, nom en capitales serif dorées.
    id: 'diamond-crest',
    label: 'Diamant serti',
    category: 'diamond',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        ...brilliantSolid(320, 6, 360),
        text({ text: initials, x: CX, y: 262, size: 150, font: 'caps', color: 'accent', tracking: 0.04, maxWidth: 210 }),
        ...(name ? [text({ text: name, x: CX, y: 468, size: 98, font: 'caps', color: 'accent', tracking: 0.2, upper: true, maxWidth: 940 })] : []),
        ...tagline(tl, 545, 'accent', 40),
      ]),
  },
  {
    // Diamant filaire seul, nom en capitales serif largement espacées.
    id: 'diamond-line',
    label: 'Diamant filaire',
    category: 'diamond',
    build: ({ name, tagline: tl }) =>
      scene([
        ...brilliantOutline(350, 0, 300, 1.1),
        ...nameCaps(name, 430, 92, 'elegant', 0.36),
        ...tagline(tl, 510, 'accent', 34),
      ]),
  },
  {
    // Petit diamant en couronne au-dessus d'un grand monogramme serif.
    id: 'diamond-monogram',
    label: 'Diamant monogramme',
    category: 'diamond',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        ...brilliantOutline(445, 0, 110, 1.4),
        text({ text: initials, x: CX, y: 345, size: 250, font: 'elegant', color: 'primary', tracking: 0.02 }),
        rule(400, 120, 'accent', 1.5),
        ...nameCaps(name, 475, 58, 'elegant', 0.42),
        ...tagline(tl, 545, 'accent', 30),
      ]),
  },
  {
    // Nom en capitales serif, ornement filet — diamant — filet, sous-titre.
    id: 'diamond-ornament',
    label: 'Diamant & filets',
    category: 'diamond',
    build: ({ name, tagline: tl }) =>
      scene([
        ...nameCaps(name, 300, 118, 'elegant', 0.22),
        { t: 'line', x1: 110, y1: 372, x2: 440, y2: 372, stroke: 'accent', lw: 1.5 },
        ...brilliantOutline(470, 342, 60, 1.6),
        { t: 'line', x1: 560, y1: 372, x2: 890, y2: 372, stroke: 'accent', lw: 1.5 },
        ...tagline(tl, 470, 'primary', 34),
      ]),
  },
  {
    // Sceau : double anneau, nom en arc, initiales et diamant au centre.
    id: 'diamond-seal',
    label: 'Sceau diamant',
    category: 'diamond',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        { t: 'circle', cx: CX, cy: 325, r: 300, stroke: 'primary', lw: 3 },
        { t: 'circle', cx: CX, cy: 325, r: 274, stroke: 'accent', lw: 1.2 },
        text({ text: initials, x: CX, y: 372, size: 170, font: 'elegant', color: 'primary', tracking: 0.06 }),
        ...brilliantOutline(472, 398, 56, 1.6),
        ...(name
          ? [{ t: 'arcText', text: name, cx: CX, cy: 325, r: 236, size: 38, font: 'elegant', color: 'primary', side: 'top', spread: 140, upper: true } as ArcTextItem]
          : []),
        ...(tl
          ? [{ t: 'arcText', text: tl, cx: CX, cy: 325, r: 236, size: 30, font: 'sans', color: 'accent', side: 'bottom', spread: 110, upper: true } as ArcTextItem]
          : []),
      ]),
  },
  {
    // Nom en italique serif, diamant en signature, sous-titre.
    id: 'diamond-signature',
    label: 'Signature diamant',
    category: 'diamond',
    build: ({ name, tagline: tl }) =>
      scene([
        text({ text: name, x: CX, y: 320, size: 175, font: 'elegantItalic', color: 'primary', maxWidth: 940 }),
        ...brilliantOutline(471, 352, 58, 1.6),
        ...tagline(tl, 500, 'accent', 34),
      ]),
  },
  {
    // Premier mot en grand, second encadré de deux diamants, sous-titre.
    id: 'diamond-duo',
    label: 'Diamant duo',
    category: 'diamond',
    build: ({ name, tagline: tl }) => {
      const [first, rest] = splitName(name)
      const items: LogoItem[] = [
        text({ text: first, x: CX, y: 285, size: 170, font: 'elegant', color: 'primary', tracking: 0.12, upper: true, maxWidth: 940 }),
      ]
      if (rest) {
        items.push(
          // Le mot est borné à 300 px de large : les diamants restent au-delà.
          ...brilliantOutline(CX - 232, 336, 44, 1.6),
          text({ text: rest, x: CX, y: 378, size: 60, font: 'elegant', color: 'accent', tracking: 0.5, upper: true, maxWidth: 300 }),
          ...brilliantOutline(CX + 188, 336, 44, 1.6),
        )
      } else {
        items.push(...brilliantOutline(471, 330, 58, 1.6))
      }
      items.push(...tagline(tl, 470, 'primary', 32))
      return scene(items)
    },
  },

  // ═══ Monogrammes ═══
  {
    // Inspiré des logos « luxury driver » : deux initiales entrelacées en
    // grand serif doré, filet, nom en capitales très espacées.
    id: 'luxury-monogram',
    label: 'Monogramme luxe',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) => {
      const letters = [...initials]
      const items: LogoItem[] = []
      if (letters.length >= 2) {
        items.push(
          text({ text: letters[0]!, x: CX - 70, y: 350, size: 360, font: 'elegant', color: 'accent' }),
          text({ text: letters.slice(1).join(''), x: CX + 75, y: 350, size: 360, font: 'elegantItalic', color: 'accent' }),
        )
      } else {
        items.push(text({ text: initials, x: CX, y: 350, size: 360, font: 'elegant', color: 'accent' }))
      }
      items.push(
        rule(400, 430, 'primary', 1.5),
        ...nameCaps(name, 500, 62, 'sans', 0.5),
        ...tagline(tl, 575, 'primary', 30),
      )
      return scene(items)
    },
  },
  {
    id: 'seal',
    label: 'Sceau',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        { t: 'circle', cx: CX, cy: 325, r: 300, stroke: 'primary', lw: 6 },
        { t: 'circle', cx: CX, cy: 325, r: 270, stroke: 'accent', lw: 2 },
        text({ text: initials, x: CX, y: 385, size: 190, font: 'serif', color: 'primary', tracking: 0.04 }),
        ...(name
          ? [{ t: 'arcText', text: name, cx: CX, cy: 325, r: 228, size: 40, font: 'sans', color: 'primary', side: 'top', spread: 150, upper: true } as ArcTextItem]
          : []),
        ...(tl
          ? [{ t: 'arcText', text: tl, cx: CX, cy: 325, r: 228, size: 32, font: 'sans', color: 'accent', side: 'bottom', spread: 130, upper: true } as ArcTextItem]
          : []),
      ]),
  },
  {
    id: 'disc',
    label: 'Disque',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        { t: 'circle', cx: CX, cy: 250, r: 215, fill: 'primary' },
        { t: 'circle', cx: CX, cy: 250, r: 190, stroke: 'accent', lw: 2 },
        text({ text: initials, x: CX, y: 305, size: 170, font: 'serif', color: 'inverse', tracking: 0.06 }),
        ...nameCaps(name, 555, 54),
        ...tagline(tl, 615, 'accent', 28),
      ]),
  },
  {
    id: 'diamond',
    label: 'Losange',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        { t: 'poly', points: regularPolygon(CX, 245, 235, 4), stroke: 'accent', lw: 5 },
        { t: 'poly', points: regularPolygon(CX, 245, 205, 4), stroke: 'primary', lw: 2 },
        text({ text: initials, x: CX, y: 300, size: 150, font: 'elegant', color: 'primary', tracking: 0.06 }),
        ...nameCaps(name, 565, 52, 'elegant', 0.22),
        ...tagline(tl, 620, 'accent', 26),
      ]),
  },
  {
    id: 'hexagon',
    label: 'Hexagone',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        { t: 'poly', points: regularPolygon(CX, 250, 230, 6, -90), stroke: 'primary', lw: 6 },
        { t: 'poly', points: regularPolygon(CX, 250, 200, 6, -90), stroke: 'accent', lw: 2 },
        text({ text: initials, x: CX, y: 305, size: 160, font: 'grotesk', color: 'primary', tracking: 0.02 }),
        ...nameCaps(name, 560, 50, 'grotesk', 0.28),
        ...tagline(tl, 618, 'accent', 26),
      ]),
  },
  {
    id: 'shield',
    label: 'Blason',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        {
          t: 'poly',
          points: [
            [300, 40],
            [700, 40],
            [700, 260],
            [500, 470],
            [300, 260],
          ],
          fill: 'primary',
        },
        {
          t: 'poly',
          points: [
            [330, 70],
            [670, 70],
            [670, 250],
            [500, 430],
            [330, 250],
          ],
          stroke: 'accent',
          lw: 3,
        },
        text({ text: initials, x: CX, y: 290, size: 160, font: 'caps', color: 'inverse', tracking: 0.04 }),
        ...nameCaps(name, 560, 50, 'caps', 0.2),
        ...tagline(tl, 618, 'accent', 26),
      ]),
  },
  {
    id: 'monogram-xl',
    label: 'Grand monogramme',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        text({ text: initials, x: CX, y: 372, size: 360, font: 'elegant', color: 'primary', tracking: -0.02 }),
        rule(430, 140),
        ...nameCaps(name, 520, 56, 'elegant', 0.3),
        ...tagline(tl, 590, 'primary', 28),
      ]),
  },
  {
    id: 'square',
    label: 'Carré',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        { t: 'poly', points: [[290, 30], [710, 30], [710, 450], [290, 450]], stroke: 'primary', lw: 5 },
        { t: 'poly', points: [[318, 58], [682, 58], [682, 422], [318, 422]], stroke: 'accent', lw: 1.5 },
        text({ text: initials, x: CX, y: 300, size: 180, font: 'serif', color: 'primary', tracking: 0.08 }),
        ...nameCaps(name, 555, 52),
        ...tagline(tl, 615, 'accent', 26),
      ]),
  },
  {
    id: 'bar-initials',
    label: 'Initiales & barre',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) => {
      const letters = [...initials]
      const items: LogoItem[] = []
      if (letters.length >= 2) {
        items.push(
          text({ text: letters[0]!, x: CX - 150, y: 330, size: 300, font: 'serif', color: 'primary' }),
          { t: 'line', x1: CX, y1: 90, x2: CX, y2: 370, stroke: 'accent', lw: 4 },
          text({ text: letters.slice(1).join(''), x: CX + 150, y: 330, size: 300, font: 'serifItalic', color: 'primary' }),
        )
      } else {
        items.push(text({ text: initials, x: CX, y: 330, size: 300, font: 'serif', color: 'primary' }))
      }
      items.push(...nameCaps(name, 500, 54, 'serif', 0.2), ...tagline(tl, 570, 'accent', 28))
      return scene(items)
    },
  },
  {
    id: 'crest-caps',
    label: 'Armoiries',
    category: 'monogram',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        icon(LOGO_ICONS.laurelLeft, 200, 20, 300, { fill: undefined, stroke: 'accent', lw: 2.4 }),
        icon(LOGO_ICONS.laurelRight, 500, 20, 300, { fill: undefined, stroke: 'accent', lw: 2.4 }),
        text({ text: initials, x: CX, y: 250, size: 190, font: 'caps', color: 'primary', tracking: 0.08 }),
        rule(345, 90, 'accent', 2),
        ...nameCaps(name, 470, 56, 'caps', 0.22),
        ...tagline(tl, 545, 'primary', 28),
      ]),
  },

  // ═══ Typographiques ═══
  {
    id: 'classic-serif',
    label: 'Serif classique',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        rule(200, 380, 'accent', 3),
        ...nameCaps(name, 380, 120, 'serif', 0.16),
        rule(440, 380, 'accent', 3),
        ...tagline(tl, 530, 'primary', 34),
      ]),
  },
  {
    id: 'signature',
    label: 'Signature',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        text({ text: name, x: CX, y: 350, size: 170, font: 'serifItalic', color: 'primary', maxWidth: 940 }),
        rule(410, 120, 'accent', 2),
        ...tagline(tl, 490, 'primary', 32),
      ]),
  },
  {
    id: 'modern-sans',
    label: 'Moderne',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        ...nameCaps(name, 330, 110, 'grotesk', 0.3),
        { t: 'line', x1: CX - 60, y1: 390, x2: CX + 60, y2: 390, stroke: 'accent', lw: 10 },
        ...tagline(tl, 480, 'primary', 32),
      ]),
  },
  {
    id: 'two-lines',
    label: 'Prénom / Nom',
    category: 'type',
    build: ({ name, tagline: tl }) => {
      const [first, rest] = splitName(name)
      return scene([
        text({ text: first, x: CX, y: 300, size: 200, font: 'serif', color: 'primary', maxWidth: 940 }),
        ...(rest ? nameCaps(rest, 400, 60, 'sans', 0.4) : []),
        rule(455, 60, 'accent', 3),
        ...tagline(tl, 540, 'accent', 30),
      ])
    },
  },
  {
    id: 'framed',
    label: 'Encadré',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        { t: 'poly', points: [[60, 120], [940, 120], [940, 430], [60, 430]], stroke: 'primary', lw: 4 },
        { t: 'poly', points: [[80, 140], [920, 140], [920, 410], [80, 410]], stroke: 'accent', lw: 1.5 },
        { t: 'poly', points: regularPolygon(CX, 120, 16, 4), fill: 'accent' },
        ...nameCaps(name, 305, 96, 'serif', 0.14),
        ...tagline(tl, 530, 'primary', 32),
      ]),
  },
  {
    id: 'copper-line',
    label: 'Ligne cuivre',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        text({ text: name, x: CX, y: 320, size: 150, font: 'elegant', color: 'primary', tracking: 0.08, maxWidth: 940 }),
        rule(390, 300, 'accent', 2),
        { t: 'poly', points: regularPolygon(CX, 390, 14, 4), fill: 'accent' },
        ...tagline(tl, 480, 'primary', 32),
      ]),
  },
  {
    id: 'stacked-caps',
    label: 'Capitales',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        ...nameCaps(name, 330, 130, 'caps', 0.12),
        ...(tl ? tagline(`· ${tl} ·`, 440, 'accent', 34) : []),
      ]),
  },
  {
    id: 'minimal',
    label: 'Minimal',
    category: 'type',
    build: ({ name, tagline: tl }) =>
      scene([
        text({ text: name.toLowerCase(), x: CX, y: 330, size: 150, font: 'sansBold', color: 'primary', tracking: -0.02, maxWidth: 940 }),
        { t: 'circle', cx: CX, cy: 410, r: 12, fill: 'accent' },
        ...tagline(tl, 500, 'primary', 30),
      ]),
  },

  // ═══ Symboles ═══
  {
    id: 'crown',
    label: 'Couronne',
    category: 'symbol',
    build: ({ name, tagline: tl }) =>
      scene([
        icon(LOGO_ICONS.crown, 400, 20, 200),
        ...nameCaps(name, 400, 100, 'serif', 0.16),
        ...tagline(tl, 490, 'primary', 32),
      ]),
  },
  {
    id: 'star',
    label: 'Étoile',
    category: 'symbol',
    build: ({ name, tagline: tl }) =>
      scene([
        { t: 'poly', points: starPolygon(CX, 130, 95, 40), fill: 'accent' },
        ...nameCaps(name, 400, 100, 'serif', 0.16),
        ...tagline(tl, 490, 'primary', 32),
      ]),
  },
  {
    id: 'wheel',
    label: 'Volant',
    category: 'symbol',
    build: ({ name, tagline: tl }) =>
      scene([
        { t: 'circle', cx: CX, cy: 150, r: 110, stroke: 'primary', lw: 18 },
        { t: 'circle', cx: CX, cy: 150, r: 24, fill: 'accent' },
        { t: 'line', x1: CX, y1: 174, x2: CX, y2: 250, stroke: 'primary', lw: 14 },
        { t: 'line', x1: CX - 22, y1: 140, x2: CX - 100, y2: 100, stroke: 'primary', lw: 14 },
        { t: 'line', x1: CX + 22, y1: 140, x2: CX + 100, y2: 100, stroke: 'primary', lw: 14 },
        ...nameCaps(name, 420, 96, 'grotesk', 0.22),
        ...tagline(tl, 505, 'accent', 30),
      ]),
  },
  {
    id: 'wings',
    label: 'Ailes',
    category: 'symbol',
    build: ({ initials, name, tagline: tl }) =>
      scene([
        icon(LOGO_ICONS.wingLeft, 40, 30, 320),
        icon(LOGO_ICONS.wingRight, 640, 30, 320),
        text({ text: initials, x: CX, y: 275, size: 170, font: 'serif', color: 'primary', tracking: 0.06 }),
        ...nameCaps(name, 450, 70, 'serif', 0.2),
        ...tagline(tl, 530, 'primary', 30),
      ]),
  },
  {
    id: 'chevrons',
    label: 'Chevrons',
    category: 'symbol',
    build: ({ name, tagline: tl }) =>
      scene([
        { t: 'poly', points: [[330, 150], [440, 40], [500, 40], [390, 150], [500, 260], [440, 260]], fill: 'primary' },
        { t: 'poly', points: [[450, 150], [560, 40], [620, 40], [510, 150], [620, 260], [560, 260]], fill: 'accent' },
        ...nameCaps(name, 420, 96, 'grotesk', 0.26),
        ...tagline(tl, 505, 'primary', 30),
      ]),
  },
  {
    id: 'car',
    label: 'Berline',
    category: 'symbol',
    build: ({ name, tagline: tl }) =>
      scene([
        icon(LOGO_ICONS.car, 350, 20, 300, { fill: 'primary' }),
        icon(LOGO_ICONS.carWindows, 350, 20, 300, { fill: 'inverse' }),
        { t: 'circle', cx: 434, cy: 212, r: 24, fill: 'primary' },
        { t: 'circle', cx: 566, cy: 212, r: 24, fill: 'primary' },
        { t: 'circle', cx: 434, cy: 212, r: 10, fill: 'accent' },
        { t: 'circle', cx: 566, cy: 212, r: 10, fill: 'accent' },
        rule(270, 120, 'accent', 3),
        ...nameCaps(name, 410, 96, 'serif', 0.16),
        ...tagline(tl, 500, 'primary', 32),
      ]),
  },
]

export function findLogoTemplate(id: string): LogoTemplate | undefined {
  return LOGO_TEMPLATES.find((t) => t.id === id)
}

/** Boîte englobante approximative d'une scène (formes uniquement, textes centrés supposés dans la scène). */
export function sceneWithinBounds(s: LogoScene): boolean {
  const inside = (x: number, y: number) => x >= 0 && x <= s.w && y >= 0 && y <= s.h
  return s.items.every((it) => {
    switch (it.t) {
      case 'circle':
        return inside(it.cx - it.r, it.cy - it.r) && inside(it.cx + it.r, it.cy + it.r)
      case 'poly':
        return it.points.every(([x, y]) => inside(x, y))
      case 'line':
        return inside(it.x1, it.y1) && inside(it.x2, it.y2)
      case 'path':
        return inside(it.x, it.y) && inside(it.x + it.size, it.y + it.size)
      case 'text':
        return inside(it.x, it.y) && it.y - it.size * 0.75 >= 0
      case 'arcText':
        return inside(it.cx - it.r, it.cy - it.r) && inside(it.cx + it.r, it.cy + it.r)
    }
  })
}
