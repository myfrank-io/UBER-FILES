import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  loadOrCreateNfcCardDesign,
  nfcCardLinks,
  nfcDriverSelect,
  serializeNfcCardDesign,
} from '~/server/utils/nfc-card'

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
    design: serializeNfcCardDesign(driver.id, design),
    orderEmail: config.nfcCardOrderEmail,
  }
})
