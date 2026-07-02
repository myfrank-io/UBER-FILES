import { createError } from 'h3'
import type { Driver } from '@prisma/client'
import { prisma } from './prisma'
import type { DriverWithPricing } from './quote-service'

/** Charge un chauffeur ACTIF par slug avec sa configuration tarifaire, ou lève une 404. */
export async function loadActiveDriverBySlug(slug: string): Promise<DriverWithPricing> {
  const driver = await prisma.driver.findUnique({
    where: { slug },
    include: { transferBands: true, hourlyTiers: true, surcharges: true },
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
