import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { confirmSetupStep } from '~/server/utils/setup'
import { simpleRateBands } from '~/lib/setup-flow'

// Tarifs « simples » du parcours, enregistrés d'un bloc dans les mêmes colonnes
// que les réglages du dashboard : prix au km jour/nuit (→ bandes de transfert),
// minimum de course, mise à disposition, forfaits aéroport, supplément
// passagers. Puis l'étape « tarifs » est confirmée.
//
// `transfer: null` = grille de transfert laissée telle quelle (le chauffeur a
// une configuration avancée — paliers, jours spécifiques — que le parcours
// affiche sans la réécrire).
const cents = z.number().int().min(1).max(1_000_000)
const minute = z.number().int().min(0).max(1439)

const schema = z.object({
  transfer: z
    .object({
      dayPerKmCents: cents,
      nightPerKmCents: cents.nullable(),
      nightStartMinute: minute,
      nightEndMinute: minute,
    })
    .nullable(),
  minimumFareCents: z.number().int().min(0).max(1_000_000),
  hourly: z.object({ enabled: z.boolean(), pricePerHourCents: cents.nullable() }),
  airport: z.object({
    orlyRiveDroiteCents: cents.nullable(),
    orlyRiveGaucheCents: cents.nullable(),
    cdgRiveDroiteCents: cents.nullable(),
    cdgRiveGaucheCents: cents.nullable(),
    kmRateCents: cents.nullable(),
  }),
  passengers: z.object({
    thirdPassengerCents: cents.nullable(),
    fourthPassengerCents: cents.nullable(),
  }),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }
  const { transfer, minimumFareCents, hourly, airport, passengers } = body.data
  if (hourly.enabled && hourly.pricePerHourCents == null) {
    throw createError({ statusCode: 400, statusMessage: 'Indiquez le tarif horaire.' })
  }
  if (transfer && transfer.nightPerKmCents != null && transfer.nightStartMinute === transfer.nightEndMinute) {
    throw createError({ statusCode: 400, statusMessage: 'La plage de nuit doit durer au moins une heure.' })
  }

  await prisma.$transaction(async (tx) => {
    if (transfer) {
      await tx.transferRateBand.deleteMany({ where: { driverId } })
      await tx.transferRateBand.createMany({
        data: simpleRateBands(transfer).map((b) => ({ driverId, ...b })),
      })
    }
    await tx.driver.update({
      where: { id: driverId },
      data: {
        minimumFareCents,
        // Mise à disposition : seul le tarif de base est piloté ici. Les tranches
        // d'heures supplémentaires éventuelles (réglages avancés) sont conservées
        // tant que la mise à disposition reste active.
        ...(hourly.enabled
          ? { hourlyRateCents: hourly.pricePerHourCents }
          : {
              hourlyRateCents: null,
              hourlyOvertimeAfterHours: null,
              hourlyOvertimeRateCents: null,
              hourlyOvertime2AfterHours: null,
              hourlyOvertime2RateCents: null,
            }),
        airportOrlyRiveDroiteCents: airport.orlyRiveDroiteCents,
        airportOrlyRiveGaucheCents: airport.orlyRiveGaucheCents,
        airportCdgRiveDroiteCents: airport.cdgRiveDroiteCents,
        airportCdgRiveGaucheCents: airport.cdgRiveGaucheCents,
        airportKmRateCents: airport.kmRateCents,
        passengerSurcharge3Cents: passengers.thirdPassengerCents,
        passengerSurcharge4Cents: passengers.fourthPassengerCents,
      },
    })
  })

  const confirmed = await confirmSetupStep(driverId, 'tarifs')
  return { ok: true, confirmed }
})
