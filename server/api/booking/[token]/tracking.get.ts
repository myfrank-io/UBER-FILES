import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { publicPhotoUrl } from '~/server/utils/driver'
import { buildVehicleImageUrl, vehicleClassFallback } from '~/lib/vehicle-image'
import { isLivePhase, ridePhase } from '~/lib/tracking'

// Suivi de course live, pollé par la page client (via le même jeton de gestion
// signé que la réservation). La position du chauffeur n'est exposée QUE pendant
// les phases actives (en route / sur place / à bord) — jamais avant ni après.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'manage') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const booking = await prisma.booking.findUnique({
    where: { id: payload.ref },
    include: {
      driver: { include: { vehicles: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] } } },
      quote: { include: { rideRequest: true } },
    },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })

  // Données vivantes : jamais de cache.
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const phase = ridePhase(booking)
  const live = isLivePhase(phase)
  const req = booking.quote.rideRequest
  const driver = booking.driver

  // Carte chauffeur : photo de profil publique + véhicule mis en avant (photo
  // personnelle si disponible, sinon rendu CDN du modèle, sinon illustration).
  // Les blobs base64 étant omis globalement (cf. prisma.ts), la présence des
  // photos est testée par des counts légers, sans transférer les images.
  const vehicle = driver.vehicles[0] ?? null
  const [vehiclePhotoCount, driverPhotoCount] = await Promise.all([
    vehicle
      ? prisma.vehicle.count({ where: { id: vehicle.id, photoUrl: { not: null } } })
      : Promise.resolve(0),
    prisma.driver.count({ where: { id: driver.id, photoUrl: { not: null } } }),
  ])
  const vehicleImage = vehicle
    ? vehiclePhotoCount > 0
      ? `/api/public/${driver.slug}/vehicles/${vehicle.id}/photo?v=${vehicle.updatedAt.getTime()}`
      : buildVehicleImageUrl({
          make: vehicle.make,
          modelFamily: vehicle.modelFamily,
          color: vehicle.color,
          customer: config.public.imaginCustomer,
          width: 480,
        })
    : vehicleClassFallback(driver.vehicleClass)
  const vehicleLabel =
    vehicle?.modelLabel ??
    ([driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || null)

  return {
    phase,
    scheduledAt: booking.scheduledAt,
    timezone: driver.timezone,
    steps: {
      departedAt: booking.departedAt,
      arrivedAt: booking.arrivedAt,
      pickedUpAt: booking.pickedUpAt,
    },
    // ETA : vers la prise en charge en route, vers la destination à bord.
    etaAt: booking.trackingEtaAt,
    // Position en direct du chauffeur — uniquement pendant la course.
    driverPosition:
      live && booking.driverLat != null && booking.driverLng != null
        ? {
            lat: booking.driverLat,
            lng: booking.driverLng,
            heading: booking.driverHeading,
            at: booking.driverPositionAt,
          }
        : null,
    // Itinéraire courant (polyline encodée Google) pour le tracé sur la carte.
    polyline: live ? booking.trackingPolyline : null,
    pickup:
      req.pickupLat != null && req.pickupLng != null
        ? { lat: req.pickupLat, lng: req.pickupLng, address: req.pickupAddress }
        : null,
    dropoff:
      req.dropoffLat != null && req.dropoffLng != null
        ? { lat: req.dropoffLat, lng: req.dropoffLng, address: req.dropoffAddress }
        : null,
    driver: {
      displayName: driver.displayName,
      phone: driver.phone,
      photoUrl: publicPhotoUrl(driver, driverPhotoCount > 0),
      vehicleLabel,
      vehicleImage,
      vehicleColor: vehicle?.color ?? null,
    },
  }
})
