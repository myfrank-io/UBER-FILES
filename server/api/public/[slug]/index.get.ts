import { loadActiveDriverBySlug } from '~/server/utils/driver'
import { ONSITE_METHODS, type PaymentMethod } from '~/lib/payment-methods'

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

  // Moyens de paiement effectivement proposables au client : le prépaiement en
  // ligne n'est retenu que si le compte Stripe est opérationnel ; les encaissements
  // sur place sont toujours utilisables. La réservation est ouverte dès qu'au
  // moins un moyen est disponible (le chauffeur n'est plus obligé d'activer Stripe).
  const methods = driver.paymentMethods as PaymentMethod[]
  const stripeReady = Boolean(driver.stripeAccountId) && driver.stripeChargesEnabled
  const acceptedPaymentMethods = methods.filter(
    (m) => (m === 'STRIPE_PREPAYMENT' ? stripeReady : ONSITE_METHODS.includes(m)),
  )

  return {
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    acceptedPaymentMethods,
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
    bookingEnabled: acceptedPaymentMethods.length > 0,
  }
})
