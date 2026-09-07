import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  ensureNfcCardProposalToken,
  loadOrCreateNfcCardDesign,
  nfcCardLinks,
  nfcDriverSelect,
  serializeNfcCardDesign,
} from '~/server/utils/nfc-card'
import { nfcCardProposalUrl, nfcDeliveryUrl } from '~/lib/nfc-card'

// Design des cartes NFC d'un chauffeur + tout ce dont l'éditeur admin a besoin
// (liens des QR, fiche Google, logo de la carte digitale réutilisable).
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const config = useRuntimeConfig()

  const driver = await prisma.driver.findUnique({
    where: { id },
    select: {
      ...nfcDriverSelect,
      companyName: true,
      googlePlaceName: true,
      cardProfile: { select: { published: true, images: { where: { role: 'logo' }, select: { mime: true } } } },
    },
  })
  if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

  const design = await loadOrCreateNfcCardDesign(driver)
  const proposalToken = await ensureNfcCardProposalToken(design)
  const links = nfcCardLinks(config.public.appBaseUrl, driver)
  const cardLogo = driver.cardProfile?.images[0]

  return {
    driver: {
      id: driver.id,
      slug: driver.slug,
      displayName: driver.displayName,
      companyName: driver.companyName,
      phone: driver.phone,
      googlePlaceName: driver.googlePlaceName,
      cardPublished: Boolean(driver.cardProfile?.published),
      // Le logo de la carte digitale n'est réutilisable que dans un format
      // que le PDF sait incorporer (PNG/JPEG).
      cardLogoAvailable: Boolean(cardLogo && /^image\/(png|jpe?g)$/i.test(cardLogo.mime)),
    },
    links,
    // Liens publics à envoyer au chauffeur : le PDF de proposition et le
    // formulaire d'adresse de livraison. Même jeton, deux pages.
    proposalUrl: nfcCardProposalUrl(config.public.appBaseUrl, proposalToken),
    deliveryUrl: nfcDeliveryUrl(config.public.appBaseUrl, proposalToken),
    design: serializeNfcCardDesign(driver.id, design),
    orderEmail: config.nfcCardOrderEmail,
  }
})
