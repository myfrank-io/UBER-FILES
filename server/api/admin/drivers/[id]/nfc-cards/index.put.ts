import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { nfcCardDesignSchema } from '~/lib/nfc-card'
import { logoRecipeSchema } from '~/lib/logo-bank'
import { loadOrCreateNfcCardDesign, nfcDriverSelect, serializeNfcCardDesign } from '~/server/utils/nfc-card'

// Enregistrement du design. Le logo voyage à part des réglages :
//   - `logo` absent → inchangé ; `null` → supprimé ; data URL → remplacé ;
//   - `useCardLogo: true` → copie du logo de la carte de visite digitale.
// Même limite que les images de carte (~3 Mo en base64), PNG/JPEG uniquement :
// ce sont les seuls formats que pdf-lib incorpore.
const MAX_DATA_URL = 3_000_000

const schema = nfcCardDesignSchema.extend({
  logo: z
    .string()
    .max(MAX_DATA_URL, 'Logo trop volumineux (3 Mo max).')
    .regex(/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=\s]+$/i, 'Logo invalide : PNG ou JPEG attendu.')
    .nullable()
    .optional(),
  useCardLogo: z.boolean().optional(),
  // Recette de la banque de logos : fournie avec un logo généré, `null` avec
  // un logo importé ou retiré, absente si le logo ne change pas.
  logoRecipe: logoRecipeSchema.nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const driver = await prisma.driver.findUnique({ where: { id }, select: nfcDriverSelect })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors.map((e) => e.message).join(' ') })
  }
  const { logo, useCardLogo, logoRecipe, ...fields } = body.data

  let logoPatch: { logoData: string | null; logoMime: string | null; logoRecipe?: Prisma.InputJsonValue | typeof Prisma.JsonNull } | null = null
  if (useCardLogo) {
    const img = await prisma.cardImage.findFirst({
      where: { role: 'logo', profile: { driverId: id } },
      select: { data: true, mime: true },
    })
    if (!img) throw createError({ statusCode: 404, statusMessage: 'Ce chauffeur n’a pas de logo sur sa carte digitale.' })
    if (!/^image\/(png|jpe?g)$/i.test(img.mime)) {
      throw createError({ statusCode: 422, statusMessage: 'Le logo de la carte digitale n’est pas en PNG/JPEG : importez-le à la main.' })
    }
    logoPatch = { logoData: img.data, logoMime: img.mime.toLowerCase() }
  } else if (logo === null) {
    logoPatch = { logoData: null, logoMime: null }
  } else if (typeof logo === 'string') {
    const match = logo.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/)
    if (!match) throw createError({ statusCode: 400, statusMessage: 'Logo invalide.' })
    const data = match[2]!.replace(/\s/g, '')
    if (Buffer.from(data, 'base64').length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Logo invalide.' })
    }
    logoPatch = { logoData: data, logoMime: match[1]!.toLowerCase() }
  }

  // La recette suit le logo : un logo importé ou retiré l'efface, un logo
  // généré la remplace, un logo inchangé la laisse telle quelle.
  if (logoPatch) {
    logoPatch.logoRecipe = logoRecipe && logoPatch.logoData ? logoRecipe : Prisma.JsonNull
  }

  await loadOrCreateNfcCardDesign(driver)
  const design = await prisma.nfcCardDesign.update({
    where: { driverId: id },
    data: { ...fields, ...(logoPatch ?? {}) },
  })

  return { ok: true, design: serializeNfcCardDesign(id, design) }
})
