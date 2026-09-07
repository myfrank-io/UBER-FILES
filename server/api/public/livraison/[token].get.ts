import { prisma } from '~/server/utils/prisma'
import { nfcShipping } from '~/server/utils/nfc-card'
import { shippingComplete } from '~/lib/nfc-card'

// Formulaire d'adresse ouvert par le CHAUFFEUR depuis le lien que l'admin lui
// envoie (WhatsApp). Même jeton que le PDF de proposition : même destinataire,
// même commande. Le jeton est la seule protection — il est long et aléatoire,
// et ne donne accès qu'à cette adresse de livraison, jamais au compte.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || token.length < 16) {
    throw createError({ statusCode: 404, statusMessage: 'Lien introuvable.' })
  }

  const design = await prisma.nfcCardDesign.findUnique({
    where: { proposalToken: token },
    select: {
      qtyReview: true,
      qtyBusiness: true,
      shipFirstName: true,
      shipLastName: true,
      shipAddress: true,
      shipPostalCode: true,
      shipCity: true,
      shipPhone: true,
      shipFilledAt: true,
      driver: { select: { displayName: true, phone: true } },
    },
  })
  if (!design) throw createError({ statusCode: 404, statusMessage: 'Lien introuvable.' })

  const shipping = nfcShipping(design)
  // Le téléphone de la fiche chauffeur ne préremplit que si rien n'a été saisi :
  // une adresse déjà enregistrée n'est jamais écrasée par une suggestion.
  const suggestedPhone = shipping.phone || design.driver.phone || ''

  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  return {
    driverName: design.driver.displayName,
    qtyReview: design.qtyReview,
    qtyBusiness: design.qtyBusiness,
    shipping: { ...shipping, phone: suggestedPhone },
    complete: shippingComplete(shipping),
    filledAt: design.shipFilledAt,
  }
})
