import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { NFC_CARD_PRODUCTS } from '~/lib/nfc-card'
import { buildNfcCardRenderInput, loadOrCreateNfcCardDesign, nfcCardFileName, nfcDriverSelect } from '~/server/utils/nfc-card'
import { generateNfcCardPreviewPdf, generateNfcCardPrintPdf } from '~/server/utils/nfc-card-pdf'

// Téléchargement direct d'un PDF depuis l'éditeur, pour contrôler le rendu
// avant d'envoyer : `kind=preview` (les deux produits, A4), ou `kind=review` /
// `kind=business` (fichier d'impression du produit).
const query = z.object({ kind: z.enum(['preview', ...NFC_CARD_PRODUCTS]).default('preview') })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const q = query.safeParse(getQuery(event))
  if (!q.success) throw createError({ statusCode: 400, statusMessage: 'Type de PDF inconnu.' })

  const driver = await prisma.driver.findUnique({ where: { id }, select: nfcDriverSelect })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const config = useRuntimeConfig()
  const design = await loadOrCreateNfcCardDesign(driver)
  const input = await buildNfcCardRenderInput(config.public.appBaseUrl, driver, design)

  const kind = q.data.kind
  const bytes =
    kind === 'preview'
      ? await generateNfcCardPreviewPdf(input, [...NFC_CARD_PRODUCTS])
      : await generateNfcCardPrintPdf(input, kind)
  const filename = nfcCardFileName(driver.slug, kind === 'preview' ? 'previsualisation' : `${kind === 'review' ? 'avis-google' : 'visite'}-impression`)

  setResponseHeader(event, 'Content-Type', 'application/pdf')
  setResponseHeader(event, 'Content-Disposition', `inline; filename="${filename}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return Buffer.from(bytes)
})
