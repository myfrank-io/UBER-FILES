import { prisma } from './prisma'
import type { Driver } from '@prisma/client'

// Gestion du calendrier interne et détection de conflit.
// Un créneau de course occupe [scheduledAt - approche, scheduledAt + durée + approche].

export interface Slot {
  startAt: Date
  endAt: Date
}

/** Calcule le créneau bloqué par une course (course + trajet d'approche des deux côtés). */
export function bookingSlot(
  driver: Pick<Driver, 'approachBufferMinutes'>,
  scheduledAt: Date,
  serviceDurationSeconds: number,
): Slot {
  const buffer = driver.approachBufferMinutes * 60_000
  const startAt = new Date(scheduledAt.getTime() - buffer)
  const endAt = new Date(scheduledAt.getTime() + serviceDurationSeconds * 1000 + buffer)
  return { startAt, endAt }
}

/** Vrai si deux créneaux se chevauchent (bornes ouvertes). */
export function overlaps(a: Slot, b: Slot): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt
}

/**
 * Détecte un conflit entre un créneau candidat et les événements existants du chauffeur
 * (courses confirmées + indisponibilités). Renvoie le premier événement en conflit, sinon null.
 */
export async function findConflict(
  driverId: string,
  slot: Slot,
  excludeBookingId?: string,
): Promise<{ id: string; title: string | null; startAt: Date; endAt: Date } | null> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      driverId,
      // Chevauchement : event.start < slot.end ET event.end > slot.start
      startAt: { lt: slot.endAt },
      endAt: { gt: slot.startAt },
      ...(excludeBookingId ? { bookingId: { not: excludeBookingId } } : {}),
    },
    select: { id: true, title: true, startAt: true, endAt: true, type: true },
  })
  const conflict = events.find((e) => e.type === 'BOOKING' || e.type === 'UNAVAILABILITY')
  return conflict ?? null
}
