import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Le chauffeur marque l'encaissement sur place (carte/espèces/chèque) comme reçu.
// Bascule le paiement en attente de la réservation en PAID.
export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payments: true },
  })
  if (!booking || booking.driverId !== driverId) {
    throw createError({ statusCode: 404, statusMessage: 'Réservation introuvable.' })
  }

  const pending = booking.payments.find((p) => p.status === 'PENDING')
  if (!pending) {
    throw createError({ statusCode: 409, statusMessage: 'Aucun paiement en attente d’encaissement.' })
  }

  await prisma.payment.update({ where: { id: pending.id }, data: { status: 'PAID' } })

  return { ok: true }
})
