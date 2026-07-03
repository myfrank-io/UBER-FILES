import { loadActiveDriverBySlug, driverBookingMode, publicPhotoUrl } from '~/server/utils/driver'
import type { PaymentMethod } from '~/lib/payment-methods'
import { prisma } from '~/server/utils/prisma'

// Profil public d'un chauffeur + résumé tarifaire (pour la page de réservation).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await loadActiveDriverBySlug(slug)

  // Données publiques : cache CDN court + revalidation en arrière-plan, pour que
  // les visites suivantes ne repaient ni le démarrage serverless ni la requête SQL.
  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  const vehicleRows = await prisma.vehicle.findMany({
    where: { driverId: driver.id },
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
  })
  const vehicles = vehicleRows.map((v) => ({
    id: v.id,
    make: v.make,
    modelFamily: v.modelFamily,
    modelLabel: v.modelLabel,
    vehicleClass: v.vehicleClass,
    seats: v.seats,
    color: v.color,
    isPrimary: v.isPrimary,
  }))

  const cheapestKm = driver.transferBands.length
    ? Math.min(...driver.transferBands.map((b) => b.pricePerKmCents))
    : null
  const cheapestHour = driver.hourlyTiers.length
    ? Math.min(...driver.hourlyTiers.map((t) => t.pricePerHourCents))
    : null

  // Moyens de paiement effectivement proposables au client : le prépaiement en
  // ligne n'est retenu que si le prestataire actif (Stripe ou SumUp) est opérationnel ;
  // les encaissements sur place sont toujours utilisables. Le formulaire de réservation
  // reste affiché dans tous les cas (le paiement se règle en aval avec le chauffeur).
  const mode = driverBookingMode(driver)
  const acceptedPaymentMethods: PaymentMethod[] = [
    ...(mode.onlineAvailable ? (['STRIPE_PREPAYMENT'] as PaymentMethod[]) : []),
    ...mode.onSiteMethods,
  ]

  return {
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    acceptedPaymentMethods,
    slug: driver.slug,
    displayName: driver.displayName,
    tagline: driver.tagline,
    bio: driver.bio,
    photoUrl: publicPhotoUrl(driver),
    vehicle: {
      make: driver.vehicleMake,
      model: driver.vehicleModel,
      class: driver.vehicleClass,
      seats: driver.vehicleSeats,
    },
    vehicles,
    services: driver.services,
    serviceArea: driver.serviceArea,
    currency: driver.currency,
    minimumFareCents: driver.minimumFareCents,
    minLeadTimeMinutes: driver.minLeadTimeMinutes,
    hasTransfer: driver.transferBands.length > 0,
    hasHourly: driver.hourlyTiers.length > 0,
    fromKmCents: cheapestKm,
    fromHourCents: cheapestHour,
    bookingEnabled: acceptedPaymentMethods.length > 0,
    // Mode de réservation, pour adapter le formulaire et les messages du client :
    // badge « réservation instantanée », choix du règlement, écrans de succès.
    bookingMode: {
      // La demande aboutit sans validation manuelle (paiement en ligne immédiat
      // et/ou confirmation immédiate avec règlement sur place).
      instant: mode.instantOnline || mode.instantOnSite,
      autoConfirm: mode.autoConfirm,
      onlineAvailable: mode.onlineAvailable,
      // Le paiement en ligne est exigé pour réserver (aucun règlement sur place).
      onlineRequired: mode.policy === 'REQUIRED',
      onSiteMethods: mode.onSiteMethods,
    },
  }
})
