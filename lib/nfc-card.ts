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

/** QR code au verso (les deux produits) : 28 mm, centré sur la carte (x et y). */
export const QR_BOX: Box = { x: (CARD_W - 28) / 2, y: (CARD_H - 28) / 2, w: 28, h: 28 }

/** Logo Google au verso « avis ». */
export const GOOGLE_LOGO_BOX: Box = { x: 21.5, y: 67, w: 11, h: 11 }

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
export const BUSINESS_PHONE_LINE: TextLine = { key: 'phone', y: 75, size: 3.7, bold: true }

// ─── Icônes (chemins SVG, repère 0-100) ──────────────────────────────────────

/**
 * Icône NFC — la même que sur les cartes MyFrank (téléphone incliné, trois
 * ondes et un arc), reprise du tracé source `resources/cards/src-recto.svg` du
 * backend MyFrank. Formes PLEINES (remplies de la couleur des éléments), en
 * coordonnées absolues du dessin d'origine : NFC_ICON_SOURCE en donne la
 * boîte englobante, à mettre à l'échelle sur NFC_ICON_BOX.
 */
export const NFC_ICON_SOURCE: Box = { x: 47.182, y: 84.111, w: 86.977, h: 86.45 }

export const NFC_ICON_PATHS: string[] = [
  'M 111.320312 133.332031 C 111.742188 131.160156 111.359375 129.019531 110.382812 127.210938 C 110.144531 126.773438 109.582031 126.628906 109.167969 126.90625 L 109.167969 126.910156 C 108.8125 127.148438 108.699219 127.625 108.902344 128.003906 C 109.703125 129.484375 110.015625 131.238281 109.671875 133.015625 C 109.332031 134.792969 108.386719 136.304688 107.097656 137.378906 C 106.761719 137.65625 106.691406 138.136719 106.933594 138.496094 C 107.214844 138.914062 107.789062 138.988281 108.175781 138.667969 C 109.75 137.351562 110.902344 135.503906 111.320312 133.332031',
  'M 116.105469 134.253906 C 116.777344 130.753906 116.089844 127.300781 114.410156 124.441406 C 114.164062 124.023438 113.617188 123.898438 113.214844 124.171875 C 112.847656 124.417969 112.734375 124.90625 112.960938 125.285156 C 114.441406 127.804688 115.050781 130.851562 114.453125 133.9375 C 113.859375 137.023438 112.160156 139.625 109.847656 141.410156 C 109.5 141.679688 109.421875 142.175781 109.667969 142.542969 C 109.941406 142.945312 110.496094 143.03125 110.882812 142.734375 C 113.503906 140.707031 115.429688 137.757812 116.105469 134.253906',
  'M 120.570312 135.117188 C 121.488281 130.371094 120.507812 125.695312 118.167969 121.867188 C 117.921875 121.460938 117.382812 121.351562 116.988281 121.617188 C 116.613281 121.871094 116.511719 122.371094 116.746094 122.757812 C 118.867188 126.238281 119.753906 130.488281 118.921875 134.800781 C 118.09375 139.109375 115.6875 142.726562 112.421875 145.167969 C 112.0625 145.4375 111.96875 145.941406 112.222656 146.316406 C 112.492188 146.710938 113.03125 146.808594 113.414062 146.523438 C 117.007812 143.839844 119.65625 139.863281 120.570312 135.117188',
  'M 76.664062 86.199219 C 75.425781 86.730469 74.46875 87.707031 73.964844 88.957031 L 49.226562 150.503906 C 48.1875 153.085938 49.445312 156.03125 52.023438 157.070312 L 80.503906 168.515625 C 81.753906 169.015625 83.125 169.003906 84.363281 168.472656 C 85.605469 167.945312 86.5625 166.964844 87.066406 165.714844 L 111.804688 104.167969 C 112.308594 102.917969 112.292969 101.546875 111.765625 100.308594 C 111.234375 99.066406 110.253906 98.109375 109.003906 97.605469 L 80.527344 86.160156 C 79.277344 85.65625 77.90625 85.671875 76.664062 86.199219 Z M 85.023438 170.019531 C 83.371094 170.722656 81.542969 170.742188 79.878906 170.074219 L 51.398438 158.625 C 47.957031 157.242188 46.285156 153.320312 47.667969 149.878906 L 72.40625 88.332031 C 73.074219 86.667969 74.355469 85.359375 76.007812 84.65625 C 77.660156 83.949219 79.484375 83.929688 81.152344 84.601562 L 109.632812 96.046875 C 111.296875 96.71875 112.605469 97.996094 113.308594 99.648438 C 114.011719 101.300781 114.03125 103.128906 113.363281 104.792969 L 88.625 166.339844 C 87.953125 168.007812 86.675781 169.3125 85.023438 170.019531',
  'M 75.722656 163.636719 C 75.527344 163.722656 75.296875 163.730469 75.082031 163.644531 L 59.308594 157.304688 C 58.878906 157.132812 58.671875 156.640625 58.84375 156.210938 C 59.015625 155.78125 59.503906 155.574219 59.9375 155.746094 L 75.707031 162.085938 C 76.136719 162.257812 76.347656 162.746094 76.175781 163.175781 C 76.089844 163.394531 75.921875 163.550781 75.722656 163.636719',
  'M 98.558594 97.644531 C 98.359375 97.726562 98.128906 97.738281 97.914062 97.652344 L 88.5 93.867188 C 88.070312 93.695312 87.859375 93.203125 88.035156 92.773438 C 88.207031 92.34375 88.695312 92.136719 89.125 92.308594 L 98.542969 96.09375 C 98.972656 96.265625 99.179688 96.753906 99.007812 97.183594 C 98.921875 97.398438 98.753906 97.558594 98.558594 97.644531',
  'M 130.371094 120.515625 C 127.066406 115.632812 122.058594 112.328125 116.269531 111.210938 C 115.082031 110.980469 113.894531 110.851562 112.707031 110.816406 L 112.035156 112.484375 C 113.335938 112.484375 114.648438 112.605469 115.953125 112.859375 C 121.300781 113.890625 125.929688 116.945312 128.980469 121.457031 C 135.285156 130.773438 132.832031 143.476562 123.519531 149.78125 C 115.40625 155.269531 104.71875 154.117188 97.933594 147.574219 L 97.261719 149.246094 C 100.300781 152 104.003906 153.800781 107.910156 154.554688 C 113.460938 155.625 119.417969 154.582031 124.460938 151.171875 C 134.542969 144.351562 137.195312 130.597656 130.371094 120.515625',
]

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

// ─── Proposition envoyée au chauffeur ────────────────────────────────────────

/** URL publique du PDF de proposition (lien court, envoyé par WhatsApp). */
export function nfcCardProposalUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/cartes-nfc/${encodeURIComponent(token)}`
}

/**
 * Message WhatsApp prêt à envoyer : le chauffeur ouvre le PDF, valide ou
 * demande une correction. Les quantités à 0 ne sont pas mentionnées.
 */
export function nfcCardProposalMessage(opts: {
  driverName: string
  url: string
  qtyReview: number
  qtyBusiness: number
}): string {
  const firstName = opts.driverName.trim().split(/\s+/)[0] ?? ''
  const hello = firstName ? `Salut ${firstName},` : 'Salut,'
  const parts = [
    opts.qtyReview > 0 ? `${opts.qtyReview} cartes avis Google` : '',
    opts.qtyBusiness > 0 ? `${opts.qtyBusiness} cartes de visite` : '',
  ].filter(Boolean)
  const what = parts.length ? ` (${parts.join(' et ')})` : ''
  return (
    `${hello} voici la proposition de design pour tes cartes NFC${what} : ${opts.url}\n\n` +
    `Dis-moi si tu veux changer quelque chose avant l'impression.`
  )
}

// ─── Livraison ───────────────────────────────────────────────────────────────

/**
 * Adresse de livraison des cartes imprimées. Champs séparés (et non une adresse
 * libre) parce que c'est ce que demandent les formulaires du transporteur, et
 * que ça évite les saisies incomplètes du genre « rue des Lilas » sans ville.
 */
export interface NfcShipping {
  firstName: string
  lastName: string
  address: string
  postalCode: string
  city: string
  phone: string
}

export const EMPTY_SHIPPING: NfcShipping = {
  firstName: '',
  lastName: '',
  address: '',
  postalCode: '',
  city: '',
  phone: '',
}

/** Un champ d'adresse : espaces normalisés, jamais coupé au milieu d'un mot. */
const shipText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .transform((v) => v.replace(/\s+/g, ' '))

/**
 * Code postal français : 5 chiffres. Le champ VIDE est accepté ici — c'est le
 * schéma « brouillon » de l'admin, qui doit pouvoir enregistrer une adresse à
 * moitié saisie sans se faire jeter. La complétude est exigée à part
 * (nfcShippingFilledSchema), là où elle compte vraiment.
 */
const shipPostalCode = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{5}$/.test(v), 'Code postal invalide (5 chiffres).')

/** Adresse partielle : ce que l'admin peut enregistrer à tout moment. */
export const nfcShippingSchema = z.object({
  firstName: shipText(60),
  lastName: shipText(60),
  address: shipText(160),
  postalCode: shipPostalCode,
  city: shipText(80),
  phone: shipText(30),
})

/** Champs obligatoires d'une adresse complète, avec le libellé affiché. */
const REQUIRED_SHIPPING_FIELDS: { key: keyof NfcShipping; label: string }[] = [
  { key: 'firstName', label: 'Le prénom' },
  { key: 'lastName', label: 'Le nom' },
  { key: 'address', label: 'L’adresse' },
  { key: 'postalCode', label: 'Le code postal' },
  { key: 'city', label: 'La ville' },
  { key: 'phone', label: 'Le téléphone' },
]

/**
 * Adresse COMPLÈTE : ce que le chauffeur envoie depuis le lien public. À moitié
 * remplie, elle ne sert à rien — le colis ne partirait pas — donc on refuse.
 */
export const nfcShippingFilledSchema = nfcShippingSchema.superRefine((value, ctx) => {
  for (const { key, label } of REQUIRED_SHIPPING_FIELDS) {
    if (!value[key]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${label} est obligatoire.` })
    }
  }
  if (value.postalCode && !/^\d{5}$/.test(value.postalCode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['postalCode'], message: 'Code postal invalide (5 chiffres).' })
  }
})

/** Vrai quand les six champs sont renseignés : le colis peut partir. */
export function shippingComplete(shipping: Partial<NfcShipping> | null | undefined): boolean {
  if (!shipping) return false
  return REQUIRED_SHIPPING_FIELDS.every(({ key }) => Boolean(shipping[key]?.trim()))
}

/** Vrai dès qu'un champ est renseigné (adresse commencée mais incomplète). */
export function shippingStarted(shipping: Partial<NfcShipping> | null | undefined): boolean {
  if (!shipping) return false
  return Object.values(shipping).some((v) => Boolean(v?.trim()))
}

/**
 * Adresse mise en lignes, telle qu'on l'écrit sur une étiquette :
 * « Prénom Nom / adresse / 75011 Paris / 06 12 34 56 78 ». Les lignes vides
 * sont omises — une adresse partielle reste lisible.
 */
export function formatShippingLines(shipping: Partial<NfcShipping> | null | undefined): string[] {
  if (!shipping) return []
  const name = [shipping.firstName, shipping.lastName].map((v) => v?.trim() ?? '').filter(Boolean).join(' ')
  const cityLine = [shipping.postalCode, shipping.city].map((v) => v?.trim() ?? '').filter(Boolean).join(' ')
  return [name, shipping.address?.trim() ?? '', cityLine, shipping.phone?.trim() ?? ''].filter(Boolean)
}

/** URL publique du formulaire d'adresse (même jeton que la proposition). */
export function nfcDeliveryUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/livraison/${encodeURIComponent(token)}`
}

/**
 * Message WhatsApp envoyé à la main par l'admin pour réclamer l'adresse. Écrit
 * au tutoiement : ce sont les seuls messages que Paul envoie lui-même.
 */
export function nfcDeliveryMessage(opts: { driverName: string; url: string }): string {
  const firstName = opts.driverName.trim().split(/\s+/)[0] ?? ''
  const hello = firstName ? `Salut ${firstName},` : 'Salut,'
  return (
    `${hello} il me manque juste l'adresse de livraison pour t'envoyer tes cartes. ` +
    `Tu peux la remplir ici (2 minutes) : ${opts.url}`
  )
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

/**
 * Placement uniforme d'un dessin dont la boîte englobante source est
 * `source` (coordonnées absolues du tracé) dans `box`, centré. Le point
 * (source.x, source.y) du tracé atterrit en (x, y) mm ; `scale` en mm/unité.
 */
export function fitSourceInBox(box: Box, source: Box): { x: number; y: number; scale: number } {
  const scale = Math.min(box.w / source.w, box.h / source.h)
  return {
    x: box.x + (box.w - source.w * scale) / 2,
    y: box.y + (box.h - source.h * scale) / 2,
    scale,
  }
}
