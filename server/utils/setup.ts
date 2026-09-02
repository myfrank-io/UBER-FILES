import type { H3Event } from 'h3'
import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'
import { publicPhotoUrl } from './driver'
import { computeSetup, SETUP_LINK_TTL_MS, type SetupSnapshot } from '~/lib/setup-flow'
import type { PaymentMethod } from '~/lib/payment-methods'

// Parcours de configuration guidée : helpers serveur partagés entre les routes
// admin (génération du lien) et chauffeur (état, confirmation, tarifs).

/** Jeton opaque du lien de configuration (64 hex = 256 bits). */
export function newSetupToken(): string {
  return randomBytes(32).toString('hex')
}

/** URL absolue du parcours pour un jeton donné. */
export function setupLinkUrl(token: string): string {
  const config = useRuntimeConfig()
  return `${config.public.appBaseUrl}/configuration/${token}`
}

/** Date d'expiration d'un lien généré maintenant. */
export function setupLinkExpiry(): Date {
  return new Date(Date.now() + SETUP_LINK_TTL_MS)
}

/**
 * La session courante a-t-elle été ouverte par le lien de configuration ?
 * (drapeau `setupFlow` posé par /api/setup/open — autorise l'étape mot de passe.)
 */
export async function isSetupSession(event: H3Event): Promise<boolean> {
  const session = await getUserSession(event)
  return Boolean((session as { setupFlow?: boolean }).setupFlow)
}

/** Sélection Prisma commune à l'état du parcours. */
export const SETUP_DRIVER_INCLUDE = {
  transferBands: { include: { tiers: { orderBy: { position: 'asc' as const } } } },
  cancellationPolicy: true,
  user: { select: { id: true, email: true, passwordResetToken: true } },
  cardProfile: { select: { published: true } },
} as const

/**
 * Instantané du compte + état du parcours. `markComplete` : enregistre la date
 * de fin la première fois que toutes les étapes obligatoires sont faites (elle
 * sert de statut à l'admin), quelle que soit la route qui l'a constaté.
 */
export async function loadSetupState(driverId: string, setupSession: boolean) {
  const [driver, vehicleCount, photoCount] = await Promise.all([
    prisma.driver.findUniqueOrThrow({ where: { id: driverId }, include: SETUP_DRIVER_INCLUDE }),
    prisma.vehicle.count({ where: { driverId } }),
    prisma.driver.count({ where: { id: driverId, photoUrl: { not: null } } }),
  ])

  const snapshot: SetupSnapshot = {
    hasPhoto: photoCount > 0,
    hasIntro: Boolean(driver.tagline?.trim()),
    hasPhone: Boolean(driver.phone?.trim()),
    vehicleCount,
    hasRates: driver.transferBands.length > 0 || driver.hourlyRateCents != null,
    paymentMethods: driver.paymentMethods as PaymentMethod[],
    onlinePayoutReady:
      driver.paymentProvider === 'SUMUP'
        ? driver.sumupConnected
        : Boolean(driver.stripeAccountId && driver.stripeChargesEnabled),
    reviewLinkReady: Boolean(driver.googlePlaceId || driver.reviewUrl),
    telegramLinked: Boolean(driver.telegramChatId),
    cardPublished: Boolean(driver.cardProfile?.published),
    // Invitation non consommée = jeton de définition de mot de passe encore
    // présent. (Une demande « mot de passe oublié » en cours produit le même
    // signal : l'étape propose alors simplement d'en choisir un nouveau.)
    needsPassword: Boolean(driver.user?.passwordResetToken),
    setupSession,
    confirmed: driver.setupConfirmed,
  }

  const result = computeSetup(snapshot)
  let completedAt = driver.setupCompletedAt
  if (result.complete && !completedAt) {
    completedAt = new Date()
    await prisma.driver.update({ where: { id: driverId }, data: { setupCompletedAt: completedAt } })
  }

  return {
    snapshot,
    completedAt,
    driver: {
      id: driver.id,
      slug: driver.slug,
      status: driver.status,
      displayName: driver.displayName,
      tagline: driver.tagline,
      photoUrl: publicPhotoUrl(driver, photoCount > 0),
      phone: driver.phone,
      contactEmail: driver.contactEmail,
      accountEmail: driver.user?.email ?? null,
      currency: driver.currency,
      timezone: driver.timezone,
      minimumFareCents: driver.minimumFareCents,
      transferBands: driver.transferBands,
      hourlyRateCents: driver.hourlyRateCents,
      hourlyOvertimeAfterHours: driver.hourlyOvertimeAfterHours,
      hourlyOvertimeRateCents: driver.hourlyOvertimeRateCents,
      airportOrlyRiveDroiteCents: driver.airportOrlyRiveDroiteCents,
      airportOrlyRiveGaucheCents: driver.airportOrlyRiveGaucheCents,
      airportCdgRiveDroiteCents: driver.airportCdgRiveDroiteCents,
      airportCdgRiveGaucheCents: driver.airportCdgRiveGaucheCents,
      airportKmRateCents: driver.airportKmRateCents,
      passengerSurcharge3Cents: driver.passengerSurcharge3Cents,
      passengerSurcharge4Cents: driver.passengerSurcharge4Cents,
      cancellationPolicy: driver.cancellationPolicy
        ? {
            freeUntilHours: driver.cancellationPolicy.freeUntilHours,
            retainedPercent: driver.cancellationPolicy.retainedPercent,
          }
        : null,
      paymentMethods: driver.paymentMethods as PaymentMethod[],
      autoAcceptQuotes: driver.autoAcceptQuotes,
      paymentProvider: driver.paymentProvider,
      sumup: { connected: driver.sumupConnected, viaApiKey: Boolean(driver.sumupApiKey) },
      stripe: {
        connected: Boolean(driver.stripeAccountId),
        chargesEnabled: driver.stripeChargesEnabled,
      },
      googlePlace: driver.googlePlaceId
        ? { placeId: driver.googlePlaceId, name: driver.googlePlaceName, address: driver.googlePlaceAddress }
        : null,
      reviewUrl: driver.reviewUrl,
      telegramLinked: Boolean(driver.telegramChatId),
      card: {
        exists: Boolean(driver.cardProfile),
        published: Boolean(driver.cardProfile?.published),
      },
    },
  }
}

/** Ajoute une étape à la liste des étapes confirmées (idempotent). */
export async function confirmSetupStep(driverId: string, step: string): Promise<string[]> {
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    select: { setupConfirmed: true },
  })
  if (driver.setupConfirmed.includes(step)) return driver.setupConfirmed
  const confirmed = [...driver.setupConfirmed, step]
  await prisma.driver.update({ where: { id: driverId }, data: { setupConfirmed: confirmed } })
  return confirmed
}
