import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Profil + état de configuration du chauffeur connecté.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    include: { transferBands: true, hourlyTiers: true, cancellationPolicy: true },
  })
  return {
    id: driver.id,
    slug: driver.slug,
    displayName: driver.displayName,
    status: driver.status,
    currency: driver.currency,
    minimumFareCents: driver.minimumFareCents,
    minLeadTimeMinutes: driver.minLeadTimeMinutes,
    quoteExpiryHours: driver.quoteExpiryHours,
    approachBufferMinutes: driver.approachBufferMinutes,
    stripe: {
      connected: Boolean(driver.stripeAccountId),
      chargesEnabled: driver.stripeChargesEnabled,
      payoutsEnabled: driver.stripePayoutsEnabled,
    },
    telegramLinked: Boolean(driver.telegramChatId),
    transferBands: driver.transferBands,
    hourlyTiers: driver.hourlyTiers,
    cancellationPolicy: driver.cancellationPolicy,
  }
})
