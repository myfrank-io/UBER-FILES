import { requireUser } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { publicPhotoUrl } from '~/server/utils/driver'

// Profil + état de configuration du chauffeur connecté.
export default defineEventHandler(async (event) => {
  const sessionUser = await requireUser(event)
  if (sessionUser.role !== 'DRIVER' || !sessionUser.driverId) {
    throw createError({ statusCode: 403, statusMessage: 'Accès réservé aux chauffeurs.' })
  }
  const driverId = sessionUser.driverId
  const [driver, account, vehicleCount, photoCount] = await Promise.all([
    prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
      include: { transferBands: true, hourlyTiers: true, cancellationPolicy: true, surcharges: true },
    }),
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { email: true, emailVerified: true },
    }),
    prisma.vehicle.count({ where: { driverId } }),
    // Présence de la photo de profil sans rapatrier le blob base64.
    prisma.driver.count({ where: { id: driverId, photoUrl: { not: null } } }),
  ])
  return {
    id: driver.id,
    slug: driver.slug,
    // État de vérification de l'adresse email du compte (bannière de rappel).
    accountEmail: account?.email ?? null,
    emailVerified: account?.emailVerified ?? true,
    displayName: driver.displayName,
    tagline: driver.tagline,
    bio: driver.bio,
    photoUrl: publicPhotoUrl(driver, photoCount > 0),
    vehicleMake: driver.vehicleMake,
    vehicleModel: driver.vehicleModel,
    vehicleClass: driver.vehicleClass,
    vehicleSeats: driver.vehicleSeats,
    // Nombre de véhicules enregistrés (étape « Véhicule » de l'onboarding).
    vehicleCount,
    services: driver.services,
    serviceArea: driver.serviceArea,
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    reviewUrl: driver.reviewUrl,
    status: driver.status,
    currency: driver.currency,
    timezone: driver.timezone,
    paymentMethods: driver.paymentMethods,
    autoAcceptQuotes: driver.autoAcceptQuotes,
    minimumFareCents: driver.minimumFareCents,
    minLeadTimeMinutes: driver.minLeadTimeMinutes,
    quoteExpiryHours: driver.quoteExpiryHours,
    approachBufferMinutes: driver.approachBufferMinutes,
    paymentProvider: driver.paymentProvider,
    stripe: {
      connected: Boolean(driver.stripeAccountId),
      chargesEnabled: driver.stripeChargesEnabled,
      payoutsEnabled: driver.stripePayoutsEnabled,
    },
    sumup: {
      connected: driver.sumupConnected,
      merchantCode: driver.sumupMerchantCode,
      viaApiKey: Boolean(driver.sumupApiKey),
    },
    telegramLinked: Boolean(driver.telegramChatId),
    transferBands: driver.transferBands,
    hourlyTiers: driver.hourlyTiers,
    cancellationPolicy: driver.cancellationPolicy,
    surcharges: driver.surcharges,
  }
})
