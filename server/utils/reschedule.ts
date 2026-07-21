import type { RideRequest } from '@prisma/client'
import { prisma } from './prisma'
import { bookingSlot, findConflict, type Slot } from './calendar'
import { computeQuote, type DriverWithPricing } from './quote-service'

// Service de report d'horaire d'une course confirmée (partagé entre l'action
// client immédiate et l'acceptation par le chauffeur). Le prix est recalculé via
// computeQuote (source unique), et le créneau candidat vérifié sans compter la
// course elle-même (excludeBookingId).

/** Durée de service (secondes) d'une course, pour dimensionner le créneau calendrier. */
export function serviceDurationSeconds(
  req: Pick<RideRequest, 'type' | 'durationSeconds' | 'roundTrip' | 'durationHours'>,
): number {
  return req.type === 'TRANSFER'
    ? (req.durationSeconds ?? 0) * (req.roundTrip ? 2 : 1)
    : (req.durationHours ?? 0) * 3600
}

export interface RescheduleAssessment {
  slot: Slot
  newAmountCents: number
  conflict: { id: string; title: string | null; startAt: Date; endAt: Date } | null
}

/**
 * Évalue un nouvel horaire : recalcule le prix (bande jour/nuit, majoration
 * « dernière minute »…), construit le créneau et cherche un conflit calendrier
 * en excluant la course elle-même. N'écrit rien.
 */
export async function assessReschedule(opts: {
  driver: DriverWithPricing
  req: RideRequest
  bookingId: string
  newScheduledAt: Date
  apiKey?: string
  now?: Date
}): Promise<RescheduleAssessment> {
  const { driver, req, bookingId, newScheduledAt } = opts
  const computation = await computeQuote({
    driver,
    type: req.type,
    scheduledAt: newScheduledAt,
    pickup:
      req.pickupLat != null && req.pickupLng != null
        ? { lat: req.pickupLat, lng: req.pickupLng }
        : undefined,
    dropoff:
      req.dropoffLat != null && req.dropoffLng != null
        ? { lat: req.dropoffLat, lng: req.dropoffLng }
        : undefined,
    roundTrip: req.roundTrip,
    durationHours: req.durationHours ?? undefined,
    apiKey: opts.apiKey,
    now: opts.now,
  })
  const slot = bookingSlot(driver, newScheduledAt, serviceDurationSeconds(req))
  const conflict = await findConflict(driver.id, slot, bookingId)
  return { slot, newAmountCents: computation.price.amountCents, conflict }
}

/**
 * Applique le report : déplace la course et son événement calendrier sur le
 * nouveau créneau, et efface toute demande en attente. Le montant facturé n'est
 * pas modifié (le report n'est autorisé que si le nouveau prix ≤ montant convenu).
 */
export async function applyReschedule(
  bookingId: string,
  newScheduledAt: Date,
  slot: Slot,
): Promise<void> {
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { scheduledAt: newScheduledAt, pendingScheduledAt: null, pendingRequestedAt: null },
    }),
    prisma.calendarEvent.updateMany({
      where: { bookingId },
      data: { startAt: slot.startAt, endAt: slot.endAt },
    }),
  ])
}
