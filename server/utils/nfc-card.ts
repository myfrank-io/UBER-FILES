// Cartes NFC physiques — accès données et assemblage du rendu (admin uniquement).
// La logique pure (layout, schéma, URLs, QR) vit dans lib/nfc-card.ts ; le
// dessin PDF dans nfc-card-pdf.ts. Ici : charger/créer le design d'un
// chauffeur, le sérialiser pour l'éditeur, et préparer les entrées du rendu.
import type { Driver, NfcCardDesign } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import {
  DEFAULT_TITLE,
  GOOGLE_LOGO_STYLES,
  NFC_CARD_PRODUCTS,
  defaultCardName,
  formatCardPhone,
  nfcCardTargetUrl,
  type GoogleLogoStyle,
  type NfcCardProduct,
} from '~/lib/nfc-card'
import { driverReviewUrl } from '~/lib/review-link'
import type { NfcCardRenderInput } from '~/server/utils/nfc-card-pdf'

/** Design sans le blob du logo (omis globalement par le client Prisma). */
export type NfcCardDesignRow = Omit<NfcCardDesign, 'logoData'>

type DriverForCards = Pick<Driver, 'id' | 'slug' | 'displayName' | 'phone' | 'reviewUrl' | 'googlePlaceId'>

/**
 * Design d'un chauffeur, créé à la première ouverture de l'éditeur avec des
 * valeurs préremplies depuis sa fiche (prénom, titre, téléphone).
 */
export async function loadOrCreateNfcCardDesign(driver: DriverForCards): Promise<NfcCardDesignRow> {
  const existing = await prisma.nfcCardDesign.findUnique({ where: { driverId: driver.id } })
  if (existing) return existing
  return prisma.nfcCardDesign.create({
    data: {
      driverId: driver.id,
      name: defaultCardName(driver.displayName),
      title: DEFAULT_TITLE,
      phone: formatCardPhone(driver.phone),
    },
  })
}

/** URL versionnée du logo pour l'éditeur (immuable : changer le logo change l'URL). */
export function nfcCardLogoUrl(driverId: string, design: NfcCardDesignRow): string | null {
  if (!design.logoMime) return null
  return `/api/admin/drivers/${driverId}/nfc-cards/logo?v=${design.updatedAt.getTime()}`
}

function googleLogoStyle(v: string): GoogleLogoStyle {
  return (GOOGLE_LOGO_STYLES as readonly string[]).includes(v) ? (v as GoogleLogoStyle) : 'mono'
}

/** Forme JSON du design pour l'éditeur admin. */
export function serializeNfcCardDesign(driverId: string, design: NfcCardDesignRow) {
  return {
    bgColor: design.bgColor,
    fgColor: design.fgColor,
    logoUrl: nfcCardLogoUrl(driverId, design),
    logoScale: design.logoScale,
    logoOffsetX: design.logoOffsetX,
    logoOffsetY: design.logoOffsetY,
    googleLogoStyle: googleLogoStyle(design.googleLogoStyle),
    name: design.name ?? '',
    title: design.title ?? '',
    phone: design.phone ?? '',
    qtyReview: design.qtyReview,
    qtyBusiness: design.qtyBusiness,
    sentAt: design.sentAt,
    sentCount: design.sentCount,
    updatedAt: design.updatedAt,
  }
}

/** URLs encodées dans les QR (et à programmer sur les puces), par produit. */
export function nfcCardUrls(appBaseUrl: string, slug: string): Record<NfcCardProduct, string> {
  return Object.fromEntries(
    NFC_CARD_PRODUCTS.map((p) => [p, nfcCardTargetUrl(appBaseUrl, slug, p)]),
  ) as Record<NfcCardProduct, string>
}

/** Liens utiles affichés dans l'éditeur et dans l'email de production. */
export function nfcCardLinks(appBaseUrl: string, driver: DriverForCards) {
  const base = appBaseUrl.replace(/\/+$/, '')
  return {
    ...nfcCardUrls(base, driver.slug),
    googleReviewUrl: driverReviewUrl(driver),
    publicPageUrl: `${base}/${encodeURIComponent(driver.slug)}`,
  }
}

/**
 * Entrées du rendu PDF : le design (avec le blob du logo, relu ici par un
 * select explicite) résolu en valeurs prêtes à dessiner.
 */
export async function buildNfcCardRenderInput(
  appBaseUrl: string,
  driver: DriverForCards,
  design: NfcCardDesignRow,
): Promise<NfcCardRenderInput> {
  const blob = design.logoMime
    ? await prisma.nfcCardDesign.findUnique({ where: { id: design.id }, select: { logoData: true, logoMime: true } })
    : null
  const logo =
    blob?.logoData && blob.logoMime ? { bytes: new Uint8Array(Buffer.from(blob.logoData, 'base64')), mime: blob.logoMime } : null

  return {
    bgColor: design.bgColor,
    fgColor: design.fgColor,
    logo,
    logoScale: design.logoScale,
    logoOffsetX: design.logoOffsetX,
    logoOffsetY: design.logoOffsetY,
    googleLogoStyle: googleLogoStyle(design.googleLogoStyle),
    name: design.name ?? '',
    title: design.title ?? '',
    phone: design.phone ?? '',
    urls: nfcCardUrls(appBaseUrl, driver.slug),
    driverName: driver.displayName,
  }
}

/** Nom de fichier sûr, dérivé du slug (déjà [a-z0-9-]). */
export function nfcCardFileName(slug: string, suffix: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '-') || 'chauffeur'
  return `cartes-${suffix}-${safe}.pdf`
}

/** Sélection Driver minimale pour les cartes. */
export const nfcDriverSelect = {
  id: true,
  slug: true,
  displayName: true,
  phone: true,
  reviewUrl: true,
  googlePlaceId: true,
} as const
