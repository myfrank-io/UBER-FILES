import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { confirmSetupStep } from '~/server/utils/setup'

// Le chauffeur valide une étape « à confirmer » (annulation, paiement…) : ses
// valeurs, par défaut ou modifiées, ont été relues. Les tarifs se confirment
// via PUT /api/setup/rates (qui enregistre et confirme d'un bloc) ; le mot de
// passe via POST /api/setup/password.
const schema = z.object({ step: z.enum(['annulation', 'paiement', 'tarifs']) })

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Étape inconnue.' })
  const confirmed = await confirmSetupStep(driverId, body.data.step)
  return { ok: true, confirmed }
})
