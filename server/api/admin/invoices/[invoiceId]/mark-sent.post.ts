import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { INVOICE_INCLUDE, findInvoiceOr404, serializeInvoice } from '~/server/utils/invoice'

// Envoi hors de l'application (WhatsApp) : c'est le navigateur qui ouvre la
// conversation, le serveur ne peut que consigner que la facture est partie.
// Un brouillon passe donc en « Envoyée », et le compteur d'envois avance.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const invoice = await findInvoiceOr404(id)

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      sentAt: new Date(),
      sentCount: { increment: 1 },
      ...(invoice.status === 'DRAFT' ? { status: 'SENT' as const } : {}),
    },
    include: INVOICE_INCLUDE,
  })
  return { ok: true, invoice: serializeInvoice(updated) }
})
