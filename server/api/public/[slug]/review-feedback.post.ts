import { z } from 'zod'
import { loadActiveDriverBySlug } from '~/server/utils/driver'
import { notifyDriver } from '~/server/utils/notify-driver'
import { emailTemplates } from '~/server/utils/email'
import { driverFirstName } from '~/server/utils/telegram'

// Retour privé laissé sur la page de notation /avis/{slug} (note 1 à 4) :
// transmis au chauffeur (email + Telegram s'il est lié), jamais publié.
// Les 5 étoiles ne passent pas ici — le client est redirigé côté page vers le
// lien d'avis public du chauffeur. Rate-limité par IP (middleware sécurité).
const schema = z.object({
  rating: z.number().int().min(1).max(4),
  comment: z.string().trim().min(3).max(2000),
  name: z.string().trim().min(1).max(120).optional(),
  bookingRef: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,40}$/)
    .optional(),
})

// Échappement pour le parse_mode HTML de Telegram (saisies client).
const escTg = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Retour invalide.' })
  }
  const driver = await loadActiveDriverBySlug(slug)

  const { rating, comment, name, bookingRef } = body.data
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating)
  await notifyDriver(driver, {
    email: emailTemplates.internalReviewFeedback({
      driverFirstName: driverFirstName(driver.displayName),
      rating,
      comment,
      customerName: name ?? null,
      bookingRef: bookingRef ?? null,
    }),
    telegram: {
      text:
        `⭐ <b>Retour client privé — ${stars} (${rating}/5)</b>` +
        (name ? `\nDe : ${escTg(name)}` : '') +
        (bookingRef ? `\nCourse réf. ${escTg(bookingRef)}` : '') +
        `\n\n« ${escTg(comment)} »\n\nCe retour n'est pas publié en ligne.`,
    },
  })
  return { ok: true }
})
