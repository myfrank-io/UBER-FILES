import { requireAdmin } from '~/server/utils/auth'
import { findInvoiceOr404, loadIssuer, missingIssuerFields, toRenderInput } from '~/server/utils/invoice'
import { generateInvoicePdf, invoiceFileName } from '~/server/utils/invoice-pdf'

// PDF d'une facture, régénéré à chaque appel depuis la base : le fichier n'est
// jamais stocké, il ne peut donc pas diverger de la facture.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const [invoice, issuer] = await Promise.all([findInvoiceOr404(id), loadIssuer()])

  const missing = missingIssuerFields(issuer)
  if (missing.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Renseignez ${missing.join(', ')} de l’émetteur avant d’éditer une facture.`,
    })
  }

  const bytes = await generateInvoicePdf(toRenderInput(invoice, issuer))
  setResponseHeader(event, 'Content-Type', 'application/pdf')
  setResponseHeader(event, 'Content-Disposition', `inline; filename="${invoiceFileName(invoice.number, invoice.clientName)}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  // Le middleware pose X-Frame-Options: DENY sur toute réponse, ce qui
  // empêcherait l'aperçu dans l'admin de s'afficher. Ce document-ci s'affiche
  // dans notre propre page, et nulle part ailleurs.
  setResponseHeader(event, 'X-Frame-Options', 'SAMEORIGIN')
  return Buffer.from(bytes)
})
