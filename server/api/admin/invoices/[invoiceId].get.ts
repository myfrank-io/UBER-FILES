import { requireAdmin } from '~/server/utils/auth'
import {
  ensureInvoiceShareToken,
  findInvoiceOr404,
  loadIssuer,
  loadProducts,
  missingIssuerFields,
  serializeInvoice,
} from '~/server/utils/invoice'
import { invoiceShareUrl } from '~/lib/invoice'

// Une facture et l'identité de l'émetteur, pour l'écran d'édition.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const [invoice, issuer, products] = await Promise.all([findInvoiceOr404(id), loadIssuer(), loadProducts()])
  // Le lien public est créé dès l'ouverture de l'écran : le bouton WhatsApp
  // doit être un vrai lien au moment du clic, sinon il ne s'ouvre pas sur mobile.
  const shareToken = await ensureInvoiceShareToken(invoice)
  const config = useRuntimeConfig()
  return {
    invoice: serializeInvoice(invoice),
    issuer: { ...issuer, missing: missingIssuerFields(issuer) },
    products,
    shareUrl: invoiceShareUrl(config.public.appBaseUrl, shareToken),
  }
})
