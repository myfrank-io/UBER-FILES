import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { INVOICE_INCLUDE, findInvoiceOr404, serializeInvoice } from '~/server/utils/invoice'

// Suivi du règlement : brouillon → envoyée → payée, ou annulée.
const schema = z.object({ status: z.enum(['DRAFT', 'SENT', 'PAID', 'CANCELLED']) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  await findInvoiceOr404(id)

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Statut inconnu.' })
  const { status } = body.data

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      status,
      // La date de règlement suit le statut : elle disparaît si on revient en arrière.
      paidAt: status === 'PAID' ? new Date() : null,
    },
    include: INVOICE_INCLUDE,
  })

  return { ok: true, invoice: serializeInvoice(updated) }
})
