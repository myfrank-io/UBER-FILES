// Cartes NFC physiques d'un chauffeur — logique PURE (aucune I/O, aucun Prisma).
//
// Deux produits, imprimés au format carte bancaire CR80 portrait (54 × 85,6 mm) :
//   - « Avis Google » : recto logo + « Approchez votre téléphone » + icône NFC ;
//     verso « Votre avis nous intéresse ! » + QR code + logo Google.
//   - « Carte de visite en ligne » : même recto ; verso prénom + titre + QR code
//     + numéro de téléphone.
//
// Le layout est FIXE : icônes, QR et blocs de texte sont toujours au même
// endroit, seul le logo (position/taille) et les couleurs varient d'un chauffeur
// à l'autre. Toutes les coordonnées sont en millimètres sur la carte finie ;
// l'aperçu SVG (components/NfcCardPreview.vue) et le PDF d'impression
// (server/utils/nfc-card-pdf.ts) lisent les MÊMES tables — une seule source de
// vérité, jamais deux implémentations qui divergent.
import { z } from 'zod'
import QRCode from 'qrcode'

// ─── Format ──────────────────────────────────────────────────────────────────

/** Carte CR80 portrait, en mm. */
export const CARD_W = 54
export const CARD_H = 85.6
/** Rayon des coins de la carte finie (aperçu uniquement : le fichier d'impression est à bords droits). */
export const CARD_RADIUS = 3.2
/** Fond perdu sur chaque bord du fichier d'impression, en mm. */
export const BLEED = 2

export const NFC_CARD_PRODUCTS = ['review', 'business'] as const
export type NfcCardProduct = (typeof NFC_CARD_PRODUCTS)[number]

export const NFC_CARD_PRODUCT_LABELS: Record<NfcCardProduct, string> = {
  review: 'Avis Google',
  business: 'Carte de visite en ligne',
}

export type NfcCardSide = 'front' | 'back'

// ─── Layout (mm) ─────────────────────────────────────────────────────────────

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Zone de base du logo (recto) : centrée en (27, 23), 40 × 26 mm, avant échelle/décalage. */
export const LOGO_BASE = { cx: 27, cy: 23, w: 40, h: 26 }

/** Bornes des réglages du logo (échelle et décalage en mm). */
export const LOGO_SCALE_MIN = 0.4
export const LOGO_SCALE_MAX = 1.8
export const LOGO_OFFSET_MAX = 14

/** Icône NFC (téléphone + ondes) sur le recto. */
export const NFC_ICON_BOX: Box = { x: 17, y: 57, w: 20, h: 21 }

/** QR code au verso (les deux produits) : 28 mm, centré horizontalement. */
export const QR_BOX: Box = { x: 13, y: 23.5, w: 28, h: 28 }

/** Logo Google au verso « avis ». */
export const GOOGLE_LOGO_BOX: Box = { x: 21.5, y: 62, w: 11, h: 11 }

/**
 * Ligne de texte : y = ligne de base (mm), size = corps (mm), bold, upper =
 * mise en capitales, tracking = interlettrage (en em). Police serif (Times /
 * Georgia) — la charte des cartes.
 */
export interface TextLine {
  key: string
  y: number
  size: number
  bold: boolean
  upper?: boolean
  tracking?: number
}

/** Recto commun : « Approchez / votre téléphone » sous le logo, au-dessus de l'icône NFC. */
export const FRONT_TEXT: TextLine[] = [
  { key: 'front1', y: 47, size: 3.3, bold: true, upper: true, tracking: 0.04 },
  { key: 'front2', y: 51.5, size: 2.5, bold: false, upper: true, tracking: 0.06 },
]
export const FRONT_TEXT_VALUES = ['Approchez', 'votre téléphone']

/** Verso « avis » : titre sur deux lignes au-dessus du QR. */
export const REVIEW_BACK_TEXT: TextLine[] = [
  { key: 'review1', y: 11.5, size: 4, bold: false },
  { key: 'review2', y: 17, size: 4, bold: false },
]
export const REVIEW_BACK_TEXT_VALUES = ['Votre avis nous', 'intéresse !']

/** Verso « carte de visite » : prénom + titre en haut, téléphone en bas. */
export const BUSINESS_NAME_LINE: TextLine = { key: 'name', y: 11, size: 4.3, bold: false }
export const BUSINESS_TITLE_LINE: TextLine = { key: 'title', y: 16.8, size: 3.6, bold: false }
export const BUSINESS_PHONE_LINE: TextLine = { key: 'phone', y: 63.5, size: 3.7, bold: true }

// ─── Icônes (chemins SVG, repère 0-100) ──────────────────────────────────────

/**
 * Icône NFC : téléphone aux coins arrondis, tenu droit, avec deux ondes à sa
 * droite. Tracé en TRAIT (pas de remplissage), épaisseur ICON_STROKE, dans un
 * repère 0-100 mis à l'échelle sur NFC_ICON_BOX.
 */
export const NFC_ICON_PATHS = [
  // corps du téléphone
  'M22 10 h34 a8 8 0 0 1 8 8 v64 a8 8 0 0 1 -8 8 h-34 a8 8 0 0 1 -8 -8 v-64 a8 8 0 0 1 8 -8 z',
  // écouteur
  'M33 19 h12',
  // bouton (petit cercle)
  'M36.5 76 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0',
  // ondes
  'M74 36 a20 20 0 0 1 0 28',
  'M84 26 a34 34 0 0 1 0 48',
]
export const ICON_STROKE = 4.5

/**
 * Logo Google « G » (repère 0-48, tracé officiel). Quatre chemins, chacun avec
 * sa couleur officielle ; en mode monochrome ils sont tous remplis de la
 * couleur des éléments, ce qui donne la silhouette pleine du G.
 */
export const GOOGLE_G_PATHS: { d: string; color: string }[] = [
  {
    color: '#FFC107',
    d: 'M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z',
  },
  {
    color: '#FF3D00',
    d: 'M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z',
  },
  {
    color: '#4CAF50',
    d: 'M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z',
  },
  {
    color: '#1976D2',
    d: 'M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z',
  },
]
export const GOOGLE_G_VIEWBOX = 48

export const GOOGLE_LOGO_STYLES = ['mono', 'color'] as const
export type GoogleLogoStyle = (typeof GOOGLE_LOGO_STYLES)[number]

// ─── Design (réglages libres) ────────────────────────────────────────────────

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format #RRGGBB).')
  .transform((s) => s.toUpperCase())

const freeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .transform((s) => s.replace(/\s+/g, ' '))

const quantity = z.coerce.number().int().min(0).max(500)

/** Réglages modifiables par l'admin (tout sauf le logo, envoyé à part). */
export const nfcCardDesignSchema = z.object({
  bgColor: hexColor,
  fgColor: hexColor,
  logoScale: z.coerce.number().min(LOGO_SCALE_MIN).max(LOGO_SCALE_MAX),
  logoOffsetX: z.coerce.number().min(-LOGO_OFFSET_MAX).max(LOGO_OFFSET_MAX),
  logoOffsetY: z.coerce.number().min(-LOGO_OFFSET_MAX).max(LOGO_OFFSET_MAX),
  googleLogoStyle: z.enum(GOOGLE_LOGO_STYLES),
  name: freeText(40),
  title: freeText(40),
  phone: freeText(30),
  qtyReview: quantity,
  qtyBusiness: quantity,
})

export type NfcCardDesignInput = z.infer<typeof nfcCardDesignSchema>

export const DEFAULT_BG_COLOR = '#F6F1E9'
export const DEFAULT_FG_COLOR = '#111111'
export const DEFAULT_TITLE = 'Chauffeur Privé'
export const DEFAULT_QUANTITY = 10

/** Palettes proposées dans l'éditeur (fond / éléments). */
export const NFC_CARD_PRESETS: { label: string; bg: string; fg: string }[] = [
  { label: 'Crème', bg: '#F6F1E9', fg: '#111111' },
  { label: 'Blanc', bg: '#FFFFFF', fg: '#111111' },
  { label: 'Nuit', bg: '#0E1B2C', fg: '#E0B579' },
  { label: 'Noir', bg: '#111111', fg: '#FFFFFF' },
  { label: 'Sable', bg: '#E9DCC5', fg: '#2B1D0E' },
]

/**
 * Prénom par défaut d'un chauffeur : premier mot de son nom d'affichage
 * (« Guy Kerkar » → « Guy »), vide si rien d'exploitable.
 */
export function defaultCardName(displayName: string | null | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? ''
  return first
}

/**
 * Numéro affiché sur la carte : groupé par paires façon « 07.45.20.55.65 »
 * quand c'est un numéro français à 10 chiffres, sinon renvoyé tel quel.
 */
export function formatCardPhone(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const digits = s.replace(/\D/g, '')
  const national = digits.startsWith('33') && digits.length === 11 ? `0${digits.slice(2)}` : digits
  if (/^0\d{9}$/.test(national)) return national.match(/.{2}/g)!.join('.')
  return s
}

/** Boîte effective du logo après échelle et décalage (mm). */
export function logoBox(design: Pick<NfcCardDesignInput, 'logoScale' | 'logoOffsetX' | 'logoOffsetY'>): Box {
  const w = LOGO_BASE.w * design.logoScale
  const h = LOGO_BASE.h * design.logoScale
  return {
    x: LOGO_BASE.cx + design.logoOffsetX - w / 2,
    y: LOGO_BASE.cy + design.logoOffsetY - h / 2,
    w,
    h,
  }
}

/** Boîte « contain » d'une image de ratio donné dans une boîte (centrée). */
export function fitInBox(box: Box, imgW: number, imgH: number): Box {
  if (imgW <= 0 || imgH <= 0) return box
  const scale = Math.min(box.w / imgW, box.h / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** Texte tel qu'imprimé pour une ligne (capitales éventuelles). */
export function lineText(line: TextLine, value: string): string {
  return line.upper ? value.toLocaleUpperCase('fr-FR') : value
}

// ─── URLs encodées dans les QR ───────────────────────────────────────────────

/**
 * Cible du QR de chaque produit. La carte « avis » pointe le tunnel de
 * notation Ridewiz (/avis/{slug} : 5★ → fiche Google, sinon retour privé) et
 * jamais le lien Google directement ; la carte de visite pointe la carte
 * digitale publique (/carte/{slug}).
 */
export function nfcCardTargetUrl(appBaseUrl: string, slug: string, product: NfcCardProduct): string {
  const base = appBaseUrl.replace(/\/+$/, '')
  const s = encodeURIComponent(slug)
  return product === 'review' ? `${base}/avis/${s}` : `${base}/carte/${s}`
}

// ─── QR code ─────────────────────────────────────────────────────────────────

export interface QrMatrix {
  size: number
  /** dark[row][col] */
  dark: boolean[][]
}

/**
 * Matrice de modules d'un QR (niveau de correction M — le standard pour un
 * lien imprimé, lisible même avec une petite rayure). Même fonction côté
 * navigateur (aperçu) et côté serveur (PDF) : le QR imprimé est exactement
 * celui affiché.
 */
export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const dark: boolean[][] = []
  for (let r = 0; r < size; r++) {
    const row: boolean[] = []
    for (let c = 0; c < size; c++) row.push(Boolean(qr.modules.get(r, c)))
    dark.push(row)
  }
  return { size, dark }
}

/**
 * Rectangles (mm) des modules sombres d'un QR placé dans QR_BOX. Une marge
 * d'un module est laissée à l'intérieur de la boîte (zone de silence, en plus
 * du fond de carte qui l'entoure déjà).
 */
export function qrModuleRects(matrix: QrMatrix, box: Box = QR_BOX): Box[] {
  const quiet = 1
  const cell = box.w / (matrix.size + quiet * 2)
  const rects: Box[] = []
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.dark[r]![c]) continue
      rects.push({ x: box.x + (c + quiet) * cell, y: box.y + (r + quiet) * cell, w: cell, h: cell })
    }
  }
  return rects
}

// ─── Contraste ───────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}

/** Ratio de contraste WCAG entre deux couleurs #RRGGBB. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a.toUpperCase())
  const lb = luminance(b.toUpperCase())
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Un QR imprimé se lit mal sous ~3:1 de contraste ; on prévient l'admin sans
 * l'empêcher (les palettes inversées — modules clairs sur fond sombre — se
 * lisent bien avec la plupart des téléphones mais pas tous).
 */
export const QR_MIN_CONTRAST = 3

export function qrContrastWarning(bg: string, fg: string): string | null {
  const ratio = contrastRatio(bg, fg)
  if (ratio < QR_MIN_CONTRAST) return 'Contraste trop faible : le QR code risque de ne pas se scanner.'
  if (luminance(bg.toUpperCase()) < luminance(fg.toUpperCase())) {
    return 'QR clair sur fond sombre : certains téléphones ne le lisent pas. Préférez des éléments sombres sur fond clair.'
  }
  return null
}

// ─── Placement des icônes ────────────────────────────────────────────────────

/**
 * Placement uniforme (même échelle en x et y) d'un dessin carré de `unit`
 * unités dans une boîte : les traits ne sont jamais déformés, le dessin est
 * centré. Renvoie l'origine (mm) et le facteur mm/unité.
 */
export function squareInBox(box: Box, unit: number): { x: number; y: number; scale: number } {
  const side = Math.min(box.w, box.h)
  return { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, scale: side / unit }
}
