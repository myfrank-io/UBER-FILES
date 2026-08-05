// Suivi de course jour J — cœur serveur. Le chauffeur signale ses étapes
// (« je pars » / « sur place » / « client à bord ») depuis Telegram ou le
// dashboard, et partage sa « position en direct » Telegram : chaque position
// reçue met à jour la carte client et recalcule l'ETA avec trafic (Google
// Routes, throttlé). Aucune trace GPS conservée : seule la dernière position
// est stockée, et tout est purgé à la fin de la course (clearTrackingData).
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { computeLiveRoute } from './google-maps'
import { sendEmail, emailTemplates } from './email'
import { signClientToken } from './tokens'
import { bearingDegrees, ridePhase, straightDistanceMeters } from '~/lib/tracking'

export type RideProgressAction = 'depart' | 'arrive' | 'pickup'

// Fenêtre de bon sens pour « je pars » : pas plus de 6 h avant la prise en
// charge (long trajet d'approche compris), ni sur une course passée depuis 24 h.
const DEPART_MAX_EARLY_MS = 6 * 3_600_000
const DEPART_MAX_LATE_MS = 24 * 3_600_000

// Throttle des appels Google Routes : au plus un recalcul d'ETA par minute et
// par course (l'ETA est absolue — « arrivée à 14 h 32 » — elle reste juste
// entre deux recalculs).
const ETA_RECOMPUTE_MS = 60_000

// Rattachement d'une position à une course : uniquement autour du jour J.
const TRACKING_WINDOW_MS = 12 * 3_600_000

/** Champs de suivi à purger en fin de course (RGPD : aucune position conservée). */
export const TRACKING_CLEAR_DATA: Prisma.BookingUpdateInput = {
  trackingEtaAt: null,
  trackingEtaComputedAt: null,
  driverLat: null,
  driverLng: null,
  driverHeading: null,
  driverPositionAt: null,
  trackingPolyline: null,
}

const bookingInclude = {
  driver: true,
  quote: { include: { rideRequest: true } },
} satisfies Prisma.BookingInclude

type TrackedBooking = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>

export interface RideProgressResult {
  booking: TrackedBooking
  /** true si l'étape était déjà enregistrée (tap répété) — aucun effet de bord. */
  already: boolean
}

/**
 * Enregistre une étape de course déclenchée par le chauffeur. Idempotent par
 * étape ; « je pars » prévient le client par email (lien de suivi + ETA).
 * Les étapes précédentes manquantes sont remplies (arriver vaut être parti).
 */
export async function applyRideProgress(
  bookingId: string,
  driverId: string,
  action: RideProgressAction,
  now: Date = new Date(),
): Promise<RideProgressResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  })
  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }
  if (booking.status !== 'CONFIRMED') {
    throw createError({ statusCode: 422, statusMessage: 'Cette course n’est pas confirmée.' })
  }

  const already =
    (action === 'depart' && Boolean(booking.departedAt)) ||
    (action === 'arrive' && Boolean(booking.arrivedAt)) ||
    (action === 'pickup' && Boolean(booking.pickedUpAt))
  if (already) return { booking, already: true }

  const data: Prisma.BookingUpdateInput = {}
  if (action === 'depart') {
    const delta = booking.scheduledAt.getTime() - now.getTime()
    if (delta > DEPART_MAX_EARLY_MS) {
      throw createError({ statusCode: 422, statusMessage: 'Trop tôt : la prise en charge est dans plus de 6 h.' })
    }
    if (delta < -DEPART_MAX_LATE_MS) {
      throw createError({ statusCode: 422, statusMessage: 'Cette course est déjà passée.' })
    }
    data.departedAt = now
    // ETA initiale, avant toute position réelle : le chauffeur vise l'heure de
    // prise en charge ; s'il part au dernier moment, son trajet d'approche
    // configuré donne une estimation honnête. Corrigée avec trafic dès la
    // première position en direct.
    const approachMs = (booking.driver.approachBufferMinutes ?? 30) * 60_000
    data.trackingEtaAt = new Date(Math.max(now.getTime() + approachMs, booking.scheduledAt.getTime()))
  } else if (action === 'arrive') {
    data.arrivedAt = now
    if (!booking.departedAt) data.departedAt = now
    // Sur place : l'ETA d'approche n'a plus de sens, l'itinéraire non plus.
    data.trackingEtaAt = null
    data.trackingEtaComputedAt = null
    data.trackingPolyline = null
  } else {
    data.pickedUpAt = now
    if (!booking.arrivedAt) data.arrivedAt = now
    if (!booking.departedAt) data.departedAt = now
    // L'ETA repart de zéro vers la destination (recalculée à la prochaine position).
    data.trackingEtaAt = null
    data.trackingEtaComputedAt = null
    data.trackingPolyline = null
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data,
    include: bookingInclude,
  })

  // « Je pars » : le client est prévenu par email, avec le lien de suivi live.
  // Un échec d'email ne doit pas faire échouer l'action chauffeur.
  if (action === 'depart') {
    try {
      const config = useRuntimeConfig()
      const manageToken = await signClientToken(
        { purpose: 'manage', ref: booking.id },
        config.linkTokenSecret,
        '90d',
      )
      const req = booking.quote.rideRequest
      await sendEmail({
        to: req.customerEmail,
        ...emailTemplates.driverEnRoute({
          customerName: req.customerName,
          driverName: booking.driver.displayName,
          etaAt: updated.trackingEtaAt ?? booking.scheduledAt,
          timezone: booking.driver.timezone,
          trackUrl: `${config.public.appBaseUrl}/reservation/${manageToken}`,
          driverPhone: booking.driver.phone,
        }),
      })
    } catch (err) {
      console.error('[tracking] échec email « chauffeur en route »', err)
    }
  }

  return { booking: updated, already: false }
}

export interface DriverPosition {
  lat: number
  lng: number
  /** Cap Telegram (degrés), quand le téléphone le fournit. */
  heading?: number | null
}

export interface IngestResult {
  /** false si aucune course active à rattacher (position ignorée). */
  tracked: boolean
  bookingId?: string
}

/**
 * Ingestion d'une position chauffeur (partage Telegram « position en direct »).
 * Rattachée à sa course confirmée la plus proche déjà signalée « en route » ;
 * met à jour la dernière position et recalcule l'ETA + l'itinéraire avec
 * trafic (throttlé à un appel Routes par minute).
 */
export async function ingestDriverPosition(
  driverId: string,
  position: DriverPosition,
  now: Date = new Date(),
): Promise<IngestResult> {
  const booking = await prisma.booking.findFirst({
    where: {
      driverId,
      status: 'CONFIRMED',
      departedAt: { not: null },
      scheduledAt: {
        gte: new Date(now.getTime() - TRACKING_WINDOW_MS),
        lte: new Date(now.getTime() + TRACKING_WINDOW_MS),
      },
    },
    orderBy: { scheduledAt: 'asc' },
    include: bookingInclude,
  })
  if (!booking) return { tracked: false }

  // Cap : celui du téléphone si fourni, sinon calculé depuis la position
  // précédente (au-delà de 25 m — en dessous, le bruit GPS ferait pivoter la
  // voiture sur place), sinon conservé.
  const prev =
    booking.driverLat != null && booking.driverLng != null
      ? { lat: booking.driverLat, lng: booking.driverLng }
      : null
  let heading = position.heading ?? null
  if (heading == null && prev && straightDistanceMeters(prev, position) > 25) {
    heading = bearingDegrees(prev, position)
  }
  heading ??= booking.driverHeading

  const data: Prisma.BookingUpdateInput = {
    driverLat: position.lat,
    driverLng: position.lng,
    driverHeading: heading,
    driverPositionAt: now,
  }

  // Cible de l'ETA selon la phase : vers la prise en charge tant que le client
  // n'est pas à bord, vers la destination ensuite. Sur place : pas d'ETA.
  const req = booking.quote.rideRequest
  const phase = ridePhase(booking)
  const target =
    phase === 'EN_ROUTE' && req.pickupLat != null && req.pickupLng != null
      ? { lat: req.pickupLat, lng: req.pickupLng }
      : phase === 'ON_BOARD' && req.dropoffLat != null && req.dropoffLng != null
        ? { lat: req.dropoffLat, lng: req.dropoffLng }
        : null

  const etaStale =
    !booking.trackingEtaComputedAt ||
    now.getTime() - booking.trackingEtaComputedAt.getTime() >= ETA_RECOMPUTE_MS
  if (target && etaStale) {
    try {
      const config = useRuntimeConfig()
      const route = await computeLiveRoute(position, target, config.googleMapsApiKey)
      data.trackingEtaAt = new Date(now.getTime() + route.durationSeconds * 1000)
      data.trackingEtaComputedAt = now
      data.trackingPolyline = route.encodedPolyline ?? null
    } catch (err) {
      // L'ETA précédente reste affichée ; la position, elle, est toujours mise à jour.
      console.error('[tracking] échec du recalcul d’ETA', err)
    }
  }

  await prisma.booking.update({ where: { id: booking.id }, data })
  return { tracked: true, bookingId: booking.id }
}
