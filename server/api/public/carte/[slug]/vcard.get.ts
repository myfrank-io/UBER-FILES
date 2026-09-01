import { loadPublishedCard } from '~/server/utils/card'
import { buildVCard, vcardFilename } from '~/lib/vcard'

// « Ajouter à mes contacts » : sert une fiche vCard 3.0 téléchargeable.
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!

  const loaded = await loadPublishedCard(slug)
  if (!loaded) {
    throw createError({ statusCode: 404, statusMessage: 'Carte introuvable.' })
  }
  const { driver, profile } = loaded

  const address = profile.blocks.find((b) => b.kind === 'ADDRESS')?.value ?? null
  const about = profile.blocks.find((b) => b.kind === 'TEXT')?.value ?? null
  const { appBaseUrl } = useRuntimeConfig(event).public

  const vcf = buildVCard({
    displayName: driver.displayName,
    company: profile.company,
    title: profile.headline ?? driver.tagline,
    phone: driver.phone,
    email: driver.contactEmail,
    url: `${appBaseUrl}/carte/${driver.slug}`,
    address,
    note: about,
  })

  setResponseHeader(event, 'Content-Type', 'text/vcard; charset=utf-8')
  setResponseHeader(
    event,
    'Content-Disposition',
    `attachment; filename="${vcardFilename(driver.displayName)}"`,
  )
  // Le contenu suit le profil : on laisse le CDN le garder brièvement seulement.
  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  return vcf
})
