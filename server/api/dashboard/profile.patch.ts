import { z } from 'zod'
import { requireDriverId } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

const schema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  tagline: z.string().max(200).optional().nullable(),
  // Accepte une URL http(s) classique OU une image importée depuis l'appareil,
  // encodée en data URL (data:image/...;base64,…). ~8 Mo de marge en base64.
  photoUrl: z
    .string()
    .max(8_000_000)
    .refine(
      (v) => /^https?:\/\//i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
      'Photo invalide.',
    )
    .optional()
    .nullable(),
  vehicleMake: z.string().max(60).optional().nullable(),
  vehicleModel: z.string().max(60).optional().nullable(),
  vehicleClass: z.string().max(60).optional().nullable(),
  vehicleSeats: z.number().int().min(1).max(20).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  // Lien d'avis (Google, Trustpilot…). Chaîne vide = effacement.
  reviewUrl: z.union([z.string().url('Lien d’avis invalide.').max(500), z.literal(''), z.null()]).optional(),
  // Modèle du message « Partager ma page » ({client}, {chauffeur}, {lien_avis},
  // {lien_reservation}). Vide ou null = retour au modèle par défaut.
  shareMessageTemplate: z.union([z.string().max(2000, 'Modèle trop long (2000 caractères max).'), z.null()]).optional(),
})

export default defineEventHandler(async (event) => {
  const driverId = await requireDriverId(event)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  // Chaîne vide sur le lien d'avis = effacement (stocké NULL).
  const data = { ...body.data }
  if (data.reviewUrl === '') data.reviewUrl = null
  // Modèle de partage vide (ou espaces) = retour au modèle par défaut (NULL).
  if (typeof data.shareMessageTemplate === 'string' && !data.shareMessageTemplate.trim()) {
    data.shareMessageTemplate = null
  }

  const driver = await prisma.driver.update({
    where: { id: driverId },
    data: {
      ...data,
      // Modes exclusifs : un lien d'avis manuel remplace la fiche Google connectée
      // (et inversement, connecter une fiche efface le lien manuel — cf. google-place).
      ...(data.reviewUrl
        ? { googlePlaceId: null, googlePlaceName: null, googlePlaceAddress: null }
        : {}),
    },
  })

  return { ok: true, displayName: driver.displayName }
})
