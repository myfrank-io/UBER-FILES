import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { serializeProduct } from '~/server/utils/invoice'

// Modification d'un produit du catalogue. Sans effet sur les factures déjà
// émises : elles portent leur propre copie de la désignation et du prix.
const schema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom au produit.').max(80),
  label: z.string().trim().min(1, 'Indiquez la désignation imprimée sur la facture.').max(500),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'productId')!

  const existing = await prisma.invoiceProduct.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Produit introuvable.' })

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const product = await prisma.invoiceProduct.update({ where: { id }, data: body.data })
  return { ok: true, product: serializeProduct(product) }
})
