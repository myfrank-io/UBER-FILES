import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { sendQuoteToClient } from '~/server/utils/quote-actions'

// Le chauffeur valide (ou ajuste) un devis et l'envoie au client.
const schema = z.object({
  amountCents: z.number().int().positive().optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Montant invalide.' })
  }
  return sendQuoteToClient(id, driverId, body.data.amountCents)
})
