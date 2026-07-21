import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { assessReschedule, applyReschedule } from '~/server/utils/reschedule'
import { signClientToken } from '~/server/utils/tokens'
import { sendEmail, emailTemplates } from '~/server/utils/email'

// Réponse du chauffeur à une demande de report d'horaire mise en attente (course
// proche). Accepter applique le nouvel horaire et bloque le créneau ; refuser
// conserve l'horaire d'origine. Le client est prévenu dans les deux cas.
const schema = z.object({ action: z.enum(['accept', 'refuse']) })

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  const config = useRuntimeConfig()

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Action invalide.' })

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      driver: {
        include: { transferBands: { include: { tiers: true } }, surcharges: true },
      },
      quote: { include: { rideRequest: true } },
    },
  })
  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }
  if (!booking.pendingScheduledAt) {
    throw createError({ statusCode: 409, statusMessage: 'Aucune demande de modification en attente.' })
  }

  const req = booking.quote.rideRequest
  const tz = booking.driver.timezone
  const manageToken = await signClientToken(
    { purpose: 'manage', ref: booking.id },
    config.linkTokenSecret as string,
    '90d',
  )
  const manageUrl = `${config.public.appBaseUrl}/reservation/${manageToken}`

  // ── Refus : on efface la demande, l'horaire d'origine est conservé.
  if (body.data.action === 'refuse') {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { pendingScheduledAt: null, pendingRequestedAt: null },
    })
    try {
      await sendEmail({
        to: req.customerEmail,
        ...emailTemplates.rescheduleRefusedCustomer({
          driverName: booking.driver.displayName,
          scheduledAt: booking.scheduledAt,
          timezone: tz,
          manageUrl,
        }),
      })
    } catch {
      // L'échec d'email ne remet pas en cause le refus.
    }
    return { status: 'REFUSED' as const }
  }

  // ── Acceptation : on revérifie le créneau (le planning a pu changer) puis on applique.
  const newScheduledAt = booking.pendingScheduledAt
  const { slot, conflict } = await assessReschedule({
    driver: booking.driver,
    req,
    bookingId: booking.id,
    newScheduledAt,
    apiKey: config.googleMapsApiKey || undefined,
  })
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Ce créneau chevauche désormais un autre événement de votre calendrier. Refusez la demande ou libérez le créneau.',
    })
  }

  const oldScheduledAt = booking.scheduledAt
  await applyReschedule(booking.id, newScheduledAt, slot)
  try {
    await sendEmail({
      to: req.customerEmail,
      ...emailTemplates.rescheduleConfirmedCustomer({
        driverName: booking.driver.displayName,
        oldScheduledAt,
        newScheduledAt,
        timezone: tz,
        manageUrl,
        acceptedByDriver: true,
      }),
    })
  } catch {
    // idem : un échec d'email ne remet pas en cause le report appliqué.
  }
  return { status: 'APPLIED' as const, scheduledAt: newScheduledAt }
})
