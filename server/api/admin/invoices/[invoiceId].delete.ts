import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { findInvoiceOr404 } from '~/server/utils/invoice'

// Suppression d'une facture. Réservée aux brouillons : une facture émise se
// conserve, et s'annule (statut CANCELLED) plutôt qu'elle ne disparaît — une
// série de numéros doit rester continue.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const invoice = await findInvoiceOr404(id)

  if (invoice.status !== 'DRAFT') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Seul un brouillon se supprime. Annulez la facture pour la neutraliser.',
    })
  }

  await prisma.invoice.delete({ where: { id } })
  return { ok: true }
})
