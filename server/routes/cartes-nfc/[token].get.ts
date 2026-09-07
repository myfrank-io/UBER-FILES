import { prisma } from '~/server/utils/prisma'
import { NFC_CARD_PRODUCTS, type NfcCardProduct } from '~/lib/nfc-card'
import { buildNfcCardRenderInput, nfcCardFileName, nfcDriverSelect } from '~/server/utils/nfc-card'
import { generateNfcCardProposalPdf } from '~/server/utils/nfc-card-pdf'

// PDF de proposition, ouvert par le CHAUFFEUR depuis le lien que l'admin lui
// envoie (WhatsApp). Le jeton est la seule protection : il est aléatoire, long,
// et ne donne accès qu'à ce document — aucune donnée de compte, aucune écriture.
// Le PDF est régénéré à chaque ouverture : le chauffeur voit toujours le design
// enregistré, même après une correction.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || token.length < 16) {
    throw createError({ statusCode: 404, statusMessage: 'Proposition introuvable.' })
  }

  const design = await prisma.nfcCardDesign.findUnique({
    where: { proposalToken: token },
    include: { driver: { select: nfcDriverSelect } },
  })
  if (!design) throw createError({ statusCode: 404, statusMessage: 'Proposition introuvable.' })

  const quantities: Record<NfcCardProduct, number> = {
    review: design.qtyReview,
    business: design.qtyBusiness,
  }
  const products = NFC_CARD_PRODUCTS.filter((p) => quantities[p] > 0).map((product) => ({
    product,
    quantity: quantities[product],
  }))
  if (products.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Aucune carte à proposer pour l’instant.' })
  }

  const config = useRuntimeConfig()
  const input = await buildNfcCardRenderInput(config.public.appBaseUrl, design.driver, design)
  const bytes = await generateNfcCardProposalPdf(input, products)

  setResponseHeader(event, 'Content-Type', 'application/pdf')
  setResponseHeader(
    event,
    'Content-Disposition',
    `inline; filename="${nfcCardFileName(design.driver.slug, 'proposition')}"`,
  )
  // Jamais mis en cache : le design peut changer entre deux ouvertures.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  return Buffer.from(bytes)
})
