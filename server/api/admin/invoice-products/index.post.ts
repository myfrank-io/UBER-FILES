import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { serializeProduct } from '~/server/utils/invoice'

// Ajout d'un produit au catalogue. Le nouveau produit se place à la fin.
const schema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom au produit.').max(80),
  label: z.string().trim().min(1, 'Indiquez la désignation imprimée sur la facture.').max(500),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const last = await prisma.invoiceProduct.findFirst({
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const product = await prisma.invoiceProduct.create({
    data: { ...body.data, position: (last?.position ?? -1) + 1 },
  })

  return { ok: true, product: serializeProduct(product) }
})
