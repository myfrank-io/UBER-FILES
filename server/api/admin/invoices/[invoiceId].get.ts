import { requireAdmin } from '~/server/utils/auth'
import {
  findInvoiceOr404,
  loadIssuer,
  loadProducts,
  missingIssuerFields,
  serializeInvoice,
} from '~/server/utils/invoice'

// Une facture et l'identité de l'émetteur, pour l'écran d'édition.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const [invoice, issuer, products] = await Promise.all([findInvoiceOr404(id), loadIssuer(), loadProducts()])
  return {
    invoice: serializeInvoice(invoice),
    issuer: { ...issuer, missing: missingIssuerFields(issuer) },
    products,
  }
})
