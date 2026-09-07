import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { nfcCardOrderEmail, sendEmail, type EmailAttachment } from '~/server/utils/email'
import { NFC_CARD_PRODUCTS, formatShippingLines, shippingComplete, type NfcCardProduct } from '~/lib/nfc-card'
import {
  buildNfcCardRenderInput,
  loadOrCreateNfcCardDesign,
  nfcCardFileName,
  nfcCardLinks,
  nfcDriverSelect,
  nfcShipping,
  serializeNfcCardDesign,
} from '~/server/utils/nfc-card'
import { generateNfcCardPreviewPdf, generateNfcCardPrintPdf } from '~/server/utils/nfc-card-pdf'

// Validation du design : génère les PDF (impression par produit commandé +
// prévisualisation) et les envoie à la production. Le design doit avoir été
// ENREGISTRÉ avant : c'est l'état en base qui est rendu, jamais un brouillon
// non sauvegardé — ce que l'admin voit dans l'aperçu est ce qui part.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const config = useRuntimeConfig()

  const driver = await prisma.driver.findUnique({
    where: { id },
    select: { ...nfcDriverSelect, cardProfile: { select: { published: true } } },
  })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const design = await loadOrCreateNfcCardDesign(driver)
  if (!design.logoMime) {
    throw createError({ statusCode: 422, statusMessage: 'Ajoutez le logo du chauffeur avant d’envoyer le design.' })
  }
  const quantities: Record<NfcCardProduct, number> = { review: design.qtyReview, business: design.qtyBusiness }
  const products = NFC_CARD_PRODUCTS.filter((p) => quantities[p] > 0)
  if (products.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'Indiquez au moins une carte à produire.' })
  }
  if (products.includes('business') && !design.phone && !design.name) {
    throw createError({ statusCode: 422, statusMessage: 'Renseignez le nom ou le téléphone de la carte de visite.' })
  }

  const input = await buildNfcCardRenderInput(config.public.appBaseUrl, driver, design)
  const attachments: EmailAttachment[] = []
  for (const product of products) {
    const bytes = await generateNfcCardPrintPdf(input, product)
    attachments.push({
      filename: nfcCardFileName(driver.slug, `${product === 'review' ? 'avis-google' : 'visite'}-impression`),
      content: Buffer.from(bytes).toString('base64'),
    })
  }
  attachments.push({
    filename: nfcCardFileName(driver.slug, 'previsualisation'),
    content: Buffer.from(await generateNfcCardPreviewPdf(input, products)).toString('base64'),
  })

  const links = nfcCardLinks(config.public.appBaseUrl, driver)
  const to = config.nfcCardOrderEmail
  const { sent } = await sendEmail({
    to,
    attachments,
    ...nfcCardOrderEmail({
      driverName: driver.displayName,
      slug: driver.slug,
      qtyReview: design.qtyReview,
      qtyBusiness: design.qtyBusiness,
      name: design.name ?? '',
      title: design.title ?? '',
      phone: design.phone ?? '',
      reviewQrUrl: links.review,
      googleReviewUrl: links.googleReviewUrl,
      cardUrl: links.business,
      publicPageUrl: links.publicPageUrl,
      cardPublished: Boolean(driver.cardProfile?.published),
      bgColor: design.bgColor,
      fgColor: design.fgColor,
      // L'adresse manquante n'empêche PAS l'envoi (les cartes peuvent partir
      // chez l'admin), mais l'email le dit en toutes lettres.
      shippingLines: formatShippingLines(nfcShipping(design)),
      shippingComplete: shippingComplete(nfcShipping(design)),
      attachmentNames: attachments.map((a) => a.filename),
    }),
  })
  if (!sent && config.resendApiKey) {
    throw createError({ statusCode: 502, statusMessage: 'L’envoi de l’email a échoué. Réessayez.' })
  }

  const updated = await prisma.nfcCardDesign.update({
    where: { driverId: id },
    data: { sentAt: new Date(), sentCount: { increment: 1 } },
  })

  return { ok: true, sent, to, design: serializeNfcCardDesign(id, updated) }
})
