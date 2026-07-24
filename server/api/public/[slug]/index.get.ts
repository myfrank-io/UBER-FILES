import { loadActiveDriverBySlug, driverBookingMode, publicPhotoUrl } from '~/server/utils/driver'
import type { PaymentMethod } from '~/lib/payment-methods'
import { driverReviewUrl } from '~/lib/review-link'
import { airportRatesFromDriver, airportTransferEnabled } from '~/lib/airport'
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

  // Majoration « dernière minute » (réservation faite moins de X minutes avant
  // le départ) : annoncée au client dès qu'il choisit un horaire dans la fenêtre,
  // avant même l'estimation. Même règle de sélection que l'écran Mes tarifs.
  const lastMinute = driver.surcharges.find(
    (s) => s.autoApply && s.maxLeadTimeMinutes != null && s.kind === 'FIXED',
  )

  // Grille des transferts aéroport : les forfaits partent avec le profil pour que
  // la page affiche les prix instantanément (avant toute saisie d'adresse).
  const airportRates = airportRatesFromDriver(driver)

  // Supplément selon le nombre de personnes : envoyé au client seulement si le
  // chauffeur a configuré au moins un montant (3e ou 4e personne). Le sélecteur de
  // nombre de personnes n'apparaît alors sur la page publique que dans ce cas.
  // Borne haute = capacité de la flotte (sièges du plus grand véhicule), avec un
  // plancher à 4 (le barème couvre la 3e et la 4e personne) et un plafond à 8.
  const hasPassengerSurcharge =
    driver.passengerSurcharge3Cents != null || driver.passengerSurcharge4Cents != null
  const maxSeats = Math.max(
    driver.vehicleSeats ?? 0,
    ...vehicleRows.map((v) => v.seats ?? 0),
  )
  const passengerSurcharge = hasPassengerSurcharge
    ? {
        thirdCents: driver.passengerSurcharge3Cents,
        fourthCents: driver.passengerSurcharge4Cents,
        maxPassengers: Math.min(8, Math.max(4, maxSeats || 4)),
      }
    : null

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
    // Lien où le client peut laisser un avis — fiche Google connectée ou lien
    // manuel (Trustpilot…). Affiché en bouton sur la page publique s'il existe.
    reviewUrl: driverReviewUrl(driver),
    currency: driver.currency,
    // Fuseau du lieu de prise en charge : le formulaire ancre l'heure saisie
    // dessus (et non sur le navigateur du client) et l'affiche avec ce repère.
    timezone: driver.timezone,
    minimumFareCents: driver.minimumFareCents,
    minLeadTimeMinutes: driver.minLeadTimeMinutes,
    hasTransfer: driver.transferBands.length > 0,
    hasHourly: driver.hourlyRateCents != null,
    // Onglet « Aéroport » : grille complète (null = trajet non proposé).
    airportTransfer: {
      enabled: airportTransferEnabled(airportRates),
      rates: airportRates,
    },
    fromKmCents: cheapestKm,
    // « À partir de » : le tarif de base — c'est le prix réellement payé dès la
    // première heure (le tarif heure supplémentaire, plus bas, n'est qu'un
    // complément au-delà du seuil).
    fromHourCents: driver.hourlyRateCents,
    lastMinuteSurcharge: lastMinute
      ? { maxLeadTimeMinutes: lastMinute.maxLeadTimeMinutes!, amountCents: lastMinute.amount }
      : null,
    // Supplément selon le nombre de personnes (null = non proposé). Le client
    // choisit le nombre de personnes au moment de réserver.
    passengerSurcharge,
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
