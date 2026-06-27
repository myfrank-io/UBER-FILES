import { loadActiveDriverBySlug, canAcceptBookings } from '~/server/utils/driver'

// Profil public d'un chauffeur + résumé tarifaire (pour la page de réservation).
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await loadActiveDriverBySlug(slug)

  const cheapestKm = driver.transferBands.length
    ? Math.min(...driver.transferBands.map((b) => b.pricePerKmCents))
    : null
  const cheapestHour = driver.hourlyTiers.length
    ? Math.min(...driver.hourlyTiers.map((t) => t.pricePerHourCents))
    : null

  return {
    slug: driver.slug,
    displayName: driver.displayName,
    tagline: driver.tagline,
    bio: driver.bio,
    photoUrl: driver.photoUrl,
    vehicle: {
      make: driver.vehicleMake,
      model: driver.vehicleModel,
      class: driver.vehicleClass,
      seats: driver.vehicleSeats,
    },
    services: driver.services,
    serviceArea: driver.serviceArea,
    currency: driver.currency,
    minimumFareCents: driver.minimumFareCents,
    minLeadTimeMinutes: driver.minLeadTimeMinutes,
    hasTransfer: driver.transferBands.length > 0,
    hasHourly: driver.hourlyTiers.length > 0,
    fromKmCents: cheapestKm,
    fromHourCents: cheapestHour,
    bookingEnabled: canAcceptBookings(driver),
  }
})
