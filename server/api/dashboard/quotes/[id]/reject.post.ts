import { requireDriverId } from '~/server/utils/auth'
import { rejectQuote } from '~/server/utils/quote-actions'

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)
  const id = getRouterParam(event, 'id')!
  await rejectQuote(id, driverId)
  return { ok: true }
})
