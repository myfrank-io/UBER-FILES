import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Profil + état de configuration du chauffeur connecté.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    include: { transferBands: true, hourlyTiers: true, cancellationPolicy: true, surcharges: true },
  })
  return {
    id: driver.id,
    slug: driver.slug,
    displayName: driver.displayName,
    tagline: driver.tagline,
    bio: driver.bio,
    photoUrl: driver.photoUrl,
    vehicleMake: driver.vehicleMake,
    vehicleModel: driver.vehicleModel,
    vehicleClass: driver.vehicleClass,
    vehicleSeats: driver.vehicleSeats,
    services: driver.services,
    serviceArea: driver.serviceArea,
    phone: driver.phone,
    contactEmail: driver.contactEmail,
    status: driver.status,
    currency: driver.currency,
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
    },
    telegramLinked: Boolean(driver.telegramChatId),
    transferBands: driver.transferBands,
    hourlyTiers: driver.hourlyTiers,
    cancellationPolicy: driver.cancellationPolicy,
    surcharges: driver.surcharges,
  }
})
