import { prisma } from '~/server/utils/prisma'
import { nfcShippingWriteData } from '~/server/utils/nfc-card'
import { nfcShippingFilledSchema } from '~/lib/nfc-card'

// Enregistrement de l'adresse par le CHAUFFEUR lui-même. Le jeton désigne le
// design : rien d'autre n'est modifiable depuis ici (ni quantités, ni design,
// ni compte). L'adresse doit être COMPLÈTE — à moitié remplie, le colis ne
// partirait pas.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || token.length < 16) {
    throw createError({ statusCode: 404, statusMessage: 'Lien introuvable.' })
  }

  const design = await prisma.nfcCardDesign.findUnique({
    where: { proposalToken: token },
    select: { id: true },
  })
  if (!design) throw createError({ statusCode: 404, statusMessage: 'Lien introuvable.' })

  const body = await readValidatedBody(event, (b) => nfcShippingFilledSchema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors.map((e) => e.message).join(' ') })
  }

  await prisma.nfcCardDesign.update({
    where: { id: design.id },
    data: { ...nfcShippingWriteData(body.data), shipFilledAt: new Date() },
  })

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { ok: true }
})
