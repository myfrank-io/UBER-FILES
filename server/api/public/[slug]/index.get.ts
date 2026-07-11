import { loadActiveDriverBySlug, driverBookingMode, publicPhotoUrl } from '~/server/utils/driver'
import type { PaymentMethod } from '~/lib/payment-methods'
import { driverReviewUrl } from '~/lib/review-link'
import { prisma } from '~/server/utils/prisma'

// Profil public d'un chauffeur + résumé tarifaire (pour la page de réservation).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await loadActiveDriverBySlug(slug)

  // Données publiques : cache CDN court + revalidation en arrière-plan, pour que
  // les visites suivantes ne repaient ni le démarrage serverless ni la requête SQL.
  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  // Les blobs base64 sont omis globalement : la présence des photos est testée
  // par des requêtes légères (ids filtrés / count), sans transférer les images.
  const [vehicleRows, vehiclesWithPhoto, driverPhotoCount] = await Promise.all([
    prisma.vehicle.findMany({
      where: { driverId: driver.id },
      orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.vehicle.findMany({
      where: { driverId: driver.id, photoUrl: { not: null } },
      select: { id: true },
    }),
    prisma.driver.count({ where: { id: driver.id, photoUrl: { not: null } } }),
  ])
  const photoIds = new Set(vehiclesWithPhoto.map((v) => v.id))
  const vehicles = vehicleRows.map((v) => ({
    id: v.id,
    make: v.make,
    modelFamily: v.modelFamily,
    modelLabel: v.modelLabel,
    vehicleClass: v.vehicleClass,
    seats: v.seats,
    color: v.color,
    isPrimary: v.isPrimary,
    // Photo personnelle du chauffeur (prioritaire sur l'image CDN), servie en
    // vraie image HTTP avec URL versionnée — jamais le blob base64 en JSON.
    photoSrc: photoIds.has(v.id)
      ? `/api/public/${driver.slug}/vehicles/${v.id}/photo?v=${v.updatedAt.getTime()}`
      : null,
  }))

  const cheapestKm = driver.transferBands.length
    ? Math.min(...driver.transferBands.map((b) => b.pricePerKmCents))
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
    photoUrl: publicPhotoUrl(driver, driverPhotoCount > 0),
    vehicle: {
      make: driver.vehicleMake,
      model: driver.vehicleModel,
      class: driver.vehicleClass,
      seats: driver.vehicleSeats,
    },
    vehicles,
    services: driver.services,
    serviceArea: driver.serviceArea,
    // Lien où le client peut laisser un avis — fiche Google connectée ou lien
    // manuel (Trustpilot…). Affiché en bouton sur la page publique s'il existe.
    reviewUrl: driverReviewUrl(driver),
    currency: driver.currency,
    minimumFareCents: driver.minimumFareCents,
    minLeadTimeMinutes: driver.minLeadTimeMinutes,
    hasTransfer: driver.transferBands.length > 0,
    hasHourly: driver.hourlyRateCents != null,
    fromKmCents: cheapestKm,
    // « À partir de » : le tarif de base — c'est le prix réellement payé dès la
    // première heure (le tarif heure supplémentaire, plus bas, n'est qu'un
    // complément au-delà du seuil).
    fromHourCents: driver.hourlyRateCents,
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
