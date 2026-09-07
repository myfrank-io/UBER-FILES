import { requireAdmin } from '~/server/utils/auth'
import { findInvoiceOr404, loadIssuer, missingIssuerFields, serializeInvoice } from '~/server/utils/invoice'

// Une facture et l'identité de l'émetteur, pour l'écran d'édition.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const [invoice, issuer] = await Promise.all([findInvoiceOr404(id), loadIssuer()])
  return {
    invoice: serializeInvoice(invoice),
    issuer: { ...issuer, missing: missingIssuerFields(issuer) },
  }
})
