import { prisma } from '~/server/utils/prisma'
import { INVOICE_INCLUDE, loadIssuer, missingIssuerFields, toRenderInput } from '~/server/utils/invoice'
import { generateInvoicePdf, invoiceFileName } from '~/server/utils/invoice-pdf'

// Facture ouverte par le CHAUFFEUR depuis le lien qu'on lui envoie (WhatsApp).
// Le jeton est la seule protection : il est aléatoire, long, et ne donne accès
// qu'à ce document — aucune donnée de compte, aucune écriture. Le PDF est
// régénéré à chaque ouverture : le chauffeur voit toujours la facture à jour,
// même après une correction.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token || token.length < 16) {
    throw createError({ statusCode: 404, statusMessage: 'Facture introuvable.' })
  }

  const invoice = await prisma.invoice.findUnique({
    where: { shareToken: token },
    include: INVOICE_INCLUDE,
  })
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Facture introuvable.' })

  const issuer = await loadIssuer()
  if (missingIssuerFields(issuer).length > 0) {
    throw createError({ statusCode: 404, statusMessage: 'Facture introuvable.' })
  }

  const bytes = await generateInvoicePdf(toRenderInput(invoice, issuer))
  setResponseHeader(event, 'Content-Type', 'application/pdf')
  setResponseHeader(
    event,
    'Content-Disposition',
    `inline; filename="${invoiceFileName(invoice.number, invoice.clientName)}"`,
  )
  setResponseHeader(event, 'Cache-Control', 'no-store')
  // Un lien de facture n'a rien à faire dans un moteur de recherche.
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  return Buffer.from(bytes)
})
