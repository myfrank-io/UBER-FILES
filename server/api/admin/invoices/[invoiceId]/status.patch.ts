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

  // « Payée » veut dire que TOUT est encaissé : les échéances suivent, sinon
  // l'écran afficherait une facture payée avec des échéances en attente. À
  // l'inverse, revenir en arrière remet le compteur d'encaissement à zéro.
  const updated = await prisma.$transaction(async (tx) => {
    if (status === 'PAID' || status === 'SENT' || status === 'DRAFT') {
      await tx.invoiceInstallment.updateMany({
        where: { invoiceId: id },
        data: { paidAt: status === 'PAID' ? new Date() : null },
      })
    }
    return tx.invoice.update({
      where: { id },
      data: {
        status,
        // La date de règlement suit le statut : elle disparaît si on revient en arrière.
        paidAt: status === 'PAID' ? new Date() : null,
      },
      include: INVOICE_INCLUDE,
    })
  })

  return { ok: true, invoice: serializeInvoice(updated) }
})
