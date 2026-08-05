import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { applyRideProgress } from '~/server/utils/tracking'
import { ridePhase } from '~/lib/tracking'

const bodySchema = z.object({
  action: z.enum(['depart', 'arrive', 'pickup']),
})

// Étape de suivi de course déclenchée depuis le dashboard (équivalent des
// boutons Telegram) : « je pars » prévient le client par email avec le lien de
// suivi live ; « sur place » et « client à bord » mettent la page client à jour.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Action de suivi invalide.' })
  }

  const { booking, already } = await applyRideProgress(id, driverId, parsed.data.action)
  return {
    already,
    phase: ridePhase(booking),
    departedAt: booking.departedAt,
    arrivedAt: booking.arrivedAt,
    pickedUpAt: booking.pickedUpAt,
    etaAt: booking.trackingEtaAt,
  }
})
