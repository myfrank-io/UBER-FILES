import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { acceptQuote, sendQuoteToClient } from '~/server/utils/quote-actions'

// Le chauffeur accepte une demande (ou ajuste son prix).
//  - Sans ajustement : `acceptQuote` décide selon le règlement de la demande —
//    confirmation directe de la course (sur place) ou envoi du devis au client
//    avec lien de paiement (en ligne).
//  - Avec ajustement : le client doit accepter le nouveau tarif → envoi du devis.
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

  if (body.data.amountCents) {
    const sent = await sendQuoteToClient(id, driverId, body.data.amountCents)
    return { ...sent, confirmed: false }
  }
  return acceptQuote(id, driverId)
})
