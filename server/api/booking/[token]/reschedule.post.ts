import { z } from 'zod'
import { verifyClientToken } from '~/server/utils/tokens'
import { prisma } from '~/server/utils/prisma'
import { assertLeadTime } from '~/server/utils/quote-service'
import { assessReschedule, applyReschedule } from '~/server/utils/reschedule'
import { requiresDriverApproval } from '~/lib/reschedule'
import { sendEmail, emailTemplates } from '~/server/utils/email'
import { notifyDriver } from '~/server/utils/notify-driver'
import { rescheduleMessage, driverFirstName } from '~/server/utils/telegram'

// Report d'horaire d'une réservation confirmée, à l'initiative du client (jeton
// de gestion signé). Périmètre : date/heure uniquement (adresses inchangées).
//
// Règles (validées produit) :
//  - créneau candidat libre (hors la course elle-même) ET nouveau prix ≤ montant
//    convenu, sinon on invite à contacter le chauffeur ;
//  - si la course est proche (moins de `freeUntilHours` avant le départ), le
//    report passe EN ATTENTE de validation du chauffeur ; sinon il est appliqué
//    immédiatement. Le chauffeur est notifié dans les deux cas.
const schema = z.object({ scheduledAt: z.string().datetime({ offset: true }) })

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')!
  const config = useRuntimeConfig()
  const payload = await verifyClientToken(token, config.linkTokenSecret)
  if (!payload || payload.purpose !== 'manage') {
    throw createError({ statusCode: 401, statusMessage: 'Lien invalide ou expiré.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Nouvel horaire invalide.' })
  }
  const newScheduledAt = new Date(body.data.scheduledAt)

  const booking = await prisma.booking.findUnique({
    where: { id: payload.ref },
    include: {
      driver: {
        include: {
          transferBands: { include: { tiers: true } },
          surcharges: true,
          cancellationPolicy: true,
        },
      },
      quote: { include: { rideRequest: true } },
      payments: true,
    },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  if (booking.status !== 'CONFIRMED') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Seule une réservation confirmée peut être modifiée.',
    })
  }

  // Délai minimum de réservation (comme à la création).
  try {
    assertLeadTime(booking.driver, newScheduledAt)
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }

  // Recalcul prix + créneau + conflit (en excluant la course elle-même).
  let assessment
  try {
    assessment = await assessReschedule({
      driver: booking.driver,
      req: booking.quote.rideRequest,
      bookingId: booking.id,
      newScheduledAt,
      apiKey: config.googleMapsApiKey || undefined,
    })
  } catch {
    throw createError({
      statusCode: 422,
      statusMessage:
        'Impossible de recalculer le tarif pour ce créneau. Contactez votre chauffeur pour modifier l’horaire.',
    })
  }
  const { slot, newAmountCents, conflict } = assessment

  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Ce créneau n’est pas disponible dans le planning du chauffeur. Contactez-le directement pour convenir d’un autre horaire.',
    })
  }
  // Le report ne doit pas coûter plus cher que ce qui a été convenu (pas de
  // complément à encaisser). Un créneau plus onéreux (tarif nuit, dernière
  // minute…) est renvoyé vers le chauffeur.
  if (newAmountCents > booking.amountCents) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Ce nouvel horaire correspond à un tarif plus élevé. Contactez votre chauffeur pour effectuer ce changement.',
    })
  }

  const freeUntilHours = booking.driver.cancellationPolicy?.freeUntilHours ?? 24
  const needsApproval = requiresDriverApproval(
    booking.scheduledAt,
    newScheduledAt,
    new Date(),
    freeUntilHours,
  )

  const manageUrl = `${config.public.appBaseUrl}/reservation/${token}`
  const dashboardUrl = `${config.public.appBaseUrl}/dashboard/courses`
  const oldScheduledAt = booking.scheduledAt
  const tz = booking.driver.timezone
  const req = booking.quote.rideRequest

  if (needsApproval) {
    // Course proche : on enregistre la demande, l'horaire d'origine reste actif.
    await prisma.booking.update({
      where: { id: booking.id },
      data: { pendingScheduledAt: newScheduledAt, pendingRequestedAt: new Date() },
    })
    await notifyDriver(booking.driver, {
      email: emailTemplates.rescheduleDriver({
        driverFirstName: driverFirstName(booking.driver.displayName),
        customerName: req.customerName,
        oldScheduledAt,
        newScheduledAt,
        timezone: tz,
        dashboardUrl,
        needsApproval: true,
      }),
      telegram: rescheduleMessage({
        driverDisplayName: booking.driver.displayName,
        customerName: req.customerName,
        oldScheduledAt,
        newScheduledAt,
        timezone: tz,
        needsApproval: true,
      }),
    })
    try {
      await sendEmail({
        to: req.customerEmail,
        ...emailTemplates.reschedulePendingCustomer({
          driverName: booking.driver.displayName,
          newScheduledAt,
          timezone: tz,
          manageUrl,
        }),
      })
    } catch {
      // L'accusé client ne doit pas bloquer l'enregistrement de la demande.
    }
    return { status: 'PENDING' as const, pendingScheduledAt: newScheduledAt }
  }

  // Course pas imminente : report appliqué immédiatement.
  await applyReschedule(booking.id, newScheduledAt, slot)
  await notifyDriver(booking.driver, {
    email: emailTemplates.rescheduleDriver({
      driverFirstName: driverFirstName(booking.driver.displayName),
      customerName: req.customerName,
      oldScheduledAt,
      newScheduledAt,
      timezone: tz,
      dashboardUrl,
      needsApproval: false,
    }),
    telegram: rescheduleMessage({
      driverDisplayName: booking.driver.displayName,
      customerName: req.customerName,
      oldScheduledAt,
      newScheduledAt,
      timezone: tz,
      needsApproval: false,
    }),
  })
  try {
    await sendEmail({
      to: req.customerEmail,
      ...emailTemplates.rescheduleConfirmedCustomer({
        driverName: booking.driver.displayName,
        oldScheduledAt,
        newScheduledAt,
        timezone: tz,
        manageUrl,
      }),
    })
  } catch {
    // idem : un échec d'email ne remet pas en cause le report appliqué.
  }
  return { status: 'APPLIED' as const, scheduledAt: newScheduledAt }
})
