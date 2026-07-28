import { z } from 'zod'
import { loadActiveDriverBySlug } from '~/server/utils/driver'
import { estimateSchema } from '~/server/utils/validation'
import { assertLeadTime, computeQuote } from '~/server/utils/quote-service'

// Estimation de prix en direct (avant soumission). N'écrit rien en base.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const driver = await loadActiveDriverBySlug(slug)
  const config = useRuntimeConfig()

  const body = await readValidatedBody(event, (b) => estimateSchema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: formatZodError(body.error) })
  }
  const input = body.data
  const scheduledAt = new Date(input.scheduledAt)

  try {
    assertLeadTime(driver, scheduledAt)
    const result = await computeQuote({
      driver,
      type: input.type,
      scheduledAt,
      pickup: input.pickup,
      dropoff: input.dropoff,
      pickupAddress: input.pickupAddress,
      dropoffAddress: input.dropoffAddress,
      roundTrip: input.roundTrip,
      durationHours: input.durationHours,
      passengers: input.passengers,
      apiKey: config.googleMapsApiKey || undefined,
    })
    return {
      amountCents: result.price.amountCents,
      currency: result.price.currency,
      breakdown: result.price.breakdown,
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      estimatedRoute: result.estimatedRoute,
      // Transfert aéroport reconnu sur ce trajet : la page publique s'en sert pour
      // confirmer au client que le forfait s'applique (et lequel).
      airport: result.airport ?? null,
    }
  } catch (err) {
    throw createError({ statusCode: 422, statusMessage: (err as Error).message })
  }
})

function formatZodError(error: z.ZodError): string {
  return error.errors.map((e) => e.message).join(' ')
}
