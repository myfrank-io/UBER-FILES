import { createError } from 'h3'
import type { Driver } from '@prisma/client'
import { prisma } from './prisma'
import type { DriverWithPricing } from './quote-service'
import { bookingMode, type BookingMode } from '~/lib/booking-policy'
import type { PaymentMethod } from '~/lib/payment-methods'

/** Charge un chauffeur ACTIF par slug avec sa configuration tarifaire, ou lève une 404. */
export async function loadActiveDriverBySlug(slug: string): Promise<DriverWithPricing> {
  const driver = await prisma.driver.findUnique({
    where: { slug },
    include: { transferBands: true, surcharges: true },
  })
  if (!driver || driver.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })
  }
  return driver
}

/**
 * Le chauffeur peut-il encaisser en ligne ? Dépend du prestataire actif :
 *  - SUMUP  : compte OAuth connecté
 *  - STRIPE : onboarding terminé (charges activées)
 */
export function canAcceptBookings(driver: Pick<Driver, 'paymentProvider' | 'sumupConnected' | 'stripeChargesEnabled'>): boolean {
  return driver.paymentProvider === 'SUMUP' ? driver.sumupConnected : driver.stripeChargesEnabled
}

/**
 * Mode de réservation effectif du chauffeur : politique de paiement (en ligne
 * exigé / au choix / sur place) croisée avec la confirmation (automatique ou
 * manuelle), en tenant compte de l'état réel du compte de paiement en ligne.
 */
export function driverBookingMode(
  driver: Pick<
    Driver,
    'autoAcceptQuotes' | 'paymentMethods' | 'paymentProvider' | 'sumupConnected' | 'stripeChargesEnabled'
  >,
): BookingMode {
  return bookingMode(
    {
      paymentMethods: driver.paymentMethods as PaymentMethod[],
      autoAcceptQuotes: driver.autoAcceptQuotes,
    },
    canAcceptBookings(driver),
  )
}

/**
 * URL légère de la photo de profil pour les réponses JSON. Les photos importées
 * sont stockées en data URL (base64) : on ne les embarque jamais telles quelles
 * dans une réponse (poids), on renvoie l'endpoint image versionné à la place.
 * `hasPhoto` provient d'un test de présence léger (count filtré) : la colonne
 * n'est pas rapatriée. L'endpoint image gère lui-même la redirection des
 * anciennes photos hébergées en http.
 */
export function publicPhotoUrl(
  driver: Pick<Driver, 'slug' | 'updatedAt'>,
  hasPhoto: boolean,
): string | null {
  if (!hasPhoto) return null
  return `/api/public/${driver.slug}/photo?v=${driver.updatedAt.getTime()}`
}
