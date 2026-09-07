import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'

// Retrait d'un produit du catalogue. Sans risque pour la comptabilité : les
// factures ne référencent pas le catalogue, elles ont copié la désignation et
// le prix au moment où la ligne a été ajoutée.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'productId')!

  const existing = await prisma.invoiceProduct.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Produit introuvable.' })

  await prisma.invoiceProduct.delete({ where: { id } })
  return { ok: true }
})
