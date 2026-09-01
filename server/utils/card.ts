import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { buildDefaultBlocks, DEFAULT_THEME, type CardBlockKind } from '~/lib/card-blocks'
import { driverReviewUrl } from '~/lib/review-link'

// Accès à la carte de visite d'un chauffeur. Le blob des images n'est jamais
// rapatrié ici (omit global sur CardImage.data) : seules leur présence et leur
// date de mise à jour circulent, l'endpoint image sert les octets.

export const CARD_IMAGE_ROLES = ['cover', 'avatar', 'logo'] as const
export type CardImageRole = (typeof CARD_IMAGE_ROLES)[number]

export function isCardImageRole(v: unknown): v is CardImageRole {
  return typeof v === 'string' && (CARD_IMAGE_ROLES as readonly string[]).includes(v)
}

/** Nombre maximal de blocs par carte — borne la taille de la page publique. */
export const MAX_BLOCKS = 30

const blockSelect = {
  id: true,
  kind: true,
  label: true,
  value: true,
  data: true,
  position: true,
  visible: true,
} satisfies Prisma.CardBlockSelect

const profileInclude = {
  blocks: { select: blockSelect, orderBy: { position: 'asc' } },
  images: { select: { id: true, role: true, mime: true, updatedAt: true } },
} satisfies Prisma.CardProfileInclude

export type CardProfileWithRelations = Prisma.CardProfileGetPayload<{ include: typeof profileInclude }>

/**
 * Charge la carte du chauffeur, en la créant si elle n'existe pas encore —
 * pré-remplie à partir de ce que Ridewiz sait déjà de lui (téléphone, email,
 * véhicules, lien d'avis, biographie). Le chauffeur ne part jamais d'une page
 * blanche. La carte créée n'est PAS publiée : il garde la main.
 *
 * Idempotent et sûr en concurrence : deux requêtes simultanées ne créent
 * qu'une carte (contrainte d'unicité sur driverId, conflit rattrapé).
 */
export async function loadOrCreateCardProfile(driverId: string): Promise<CardProfileWithRelations> {
  const existing = await prisma.cardProfile.findUnique({
    where: { driverId },
    include: profileInclude,
  })
  if (existing) return existing

  const [driver, vehicleCount] = await Promise.all([
    prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      select: {
        tagline: true,
        phone: true,
        contactEmail: true,
        bio: true,
        companyName: true,
        reviewUrl: true,
        googlePlaceId: true,
      },
    }),
    prisma.vehicle.count({ where: { driverId } }),
  ])

  const drafts = buildDefaultBlocks({
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    hasVehicles: vehicleCount > 0,
    hasReviewLink: Boolean(
      driverReviewUrl({ reviewUrl: driver.reviewUrl, googlePlaceId: driver.googlePlaceId }),
    ),
    bio: driver.bio,
  })

  try {
    return await prisma.cardProfile.create({
      data: {
        driverId,
        theme: DEFAULT_THEME,
        headline: driver.tagline,
        company: driver.companyName,
        blocks: {
          create: drafts.map((d) => ({
            kind: d.kind as CardBlockKind,
            label: d.label,
            value: d.value,
            data: (d.data ?? undefined) as Prisma.InputJsonValue | undefined,
            position: d.position,
          })),
        },
      },
      include: profileInclude,
    })
  } catch (err) {
    // Course entre deux requêtes : l'autre a gagné, on relit la sienne.
    if ((err as { code?: string }).code === 'P2002') {
      return prisma.cardProfile.findUniqueOrThrow({
        where: { driverId },
        include: profileInclude,
      })
    }
    throw err
  }
}

/** Relit la carte après une modification (source unique de la forme renvoyée). */
export function reloadCardProfile(profileId: string): Promise<CardProfileWithRelations> {
  return prisma.cardProfile.findUniqueOrThrow({ where: { id: profileId }, include: profileInclude })
}

/**
 * Carte du chauffeur connecté, ou 404. Garantit l'isolation : on ne charge
 * jamais une carte par son id sans repasser par le driverId de la session.
 */
export async function requireOwnCardProfile(driverId: string): Promise<CardProfileWithRelations> {
  return loadOrCreateCardProfile(driverId)
}

/**
 * URL versionnée d'une image de carte. Versionnée par `updatedAt` : changer
 * l'image change l'URL, donc le cache immuable ne sert jamais l'ancienne.
 */
export function cardImageUrl(
  slug: string,
  images: { role: string; updatedAt: Date }[],
  role: CardImageRole,
): string | null {
  const img = images.find((i) => i.role === role)
  return img ? `/api/public/carte/${slug}/image/${role}?v=${img.updatedAt.getTime()}` : null
}

/** Forme JSON commune d'un bloc (dashboard et page publique). */
export function serializeBlock(b: {
  id: string
  kind: string
  label: string | null
  value: string | null
  data: Prisma.JsonValue
  position: number
  visible: boolean
}) {
  return {
    id: b.id,
    kind: b.kind as CardBlockKind,
    label: b.label,
    value: b.value,
    data: (b.data ?? null) as Record<string, unknown> | null,
    position: b.position,
    visible: b.visible,
  }
}

const publishedInclude = {
  blocks: {
    select: blockSelect,
    where: { visible: true },
    orderBy: { position: 'asc' },
  },
  images: { select: { role: true, updatedAt: true } },
} satisfies Prisma.CardProfileInclude

/**
 * Carte publiée d'un chauffeur ACTIF, avec les données du chauffeur nécessaires
 * à l'affichage et à la fiche contact. Renvoie null si le chauffeur n'existe
 * pas, n'est pas actif, n'a pas de carte, ou ne l'a pas publiée — l'appelant
 * décide du 404 (jamais de distinction visible entre ces cas).
 */
export async function loadPublishedCard(slug: string) {
  const driver = await prisma.driver.findFirst({
    where: { slug, status: 'ACTIVE', cardProfile: { published: true } },
    select: {
      id: true,
      slug: true,
      displayName: true,
      tagline: true,
      phone: true,
      contactEmail: true,
      updatedAt: true,
      reviewUrl: true,
      googlePlaceId: true,
      cardProfile: { include: publishedInclude },
    },
  })
  if (!driver?.cardProfile) return null
  return { driver, profile: driver.cardProfile }
}
