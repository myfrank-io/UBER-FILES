import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { invoiceEmail, sendEmail, type EmailAttachment } from '~/server/utils/email'
import {
  INVOICE_INCLUDE,
  findInvoiceOr404,
  loadIssuer,
  missingIssuerFields,
  serializeInvoice,
  toRenderInput,
} from '~/server/utils/invoice'
import { generateInvoicePdf, invoiceFileName } from '~/server/utils/invoice-pdf'
import { formatEuros } from '~/lib/invoice'

// Envoi de la facture au client, PDF en pièce jointe. Le destinataire par
// défaut est l'email porté par la facture ; il reste surchargeable.
const schema = z.object({ to: z.string().trim().email('Adresse email invalide.').optional() })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.errors[0]?.message ?? 'Requête invalide.' })
  }

  const [invoice, issuer] = await Promise.all([findInvoiceOr404(id), loadIssuer()])

  const missing = missingIssuerFields(issuer)
  if (missing.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Renseignez ${missing.join(', ')} de l’émetteur avant d’envoyer une facture.`,
    })
  }

  const to = body.data.to ?? invoice.clientEmail
  if (!to) {
    throw createError({ statusCode: 422, statusMessage: 'Aucune adresse email pour ce client.' })
  }

  const bytes = await generateInvoicePdf(toRenderInput(invoice, issuer))
  const attachments: EmailAttachment[] = [
    {
      filename: invoiceFileName(invoice.number, invoice.clientName),
      content: Buffer.from(bytes).toString('base64'),
    },
  ]

  const config = useRuntimeConfig()
  const { sent } = await sendEmail({
    to,
    attachments,
    ...invoiceEmail({
      number: invoice.number,
      clientName: invoice.clientContactName || invoice.clientName,
      totalLabel: formatEuros(invoice.totalCents),
      paymentTerms: invoice.paymentTerms,
      issuerName: issuer.name,
      issuerEmail: issuer.email || null,
    }),
  })
  // En développement sans clé Resend, `sent` est faux sans que rien n'ait échoué.
  if (!sent && config.resendApiKey) {
    throw createError({ statusCode: 502, statusMessage: 'L’envoi de l’email a échoué. Réessayez.' })
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      sentAt: new Date(),
      sentCount: { increment: 1 },
      // Une facture envoyée n'est plus un brouillon.
      ...(invoice.status === 'DRAFT' ? { status: 'SENT' as const } : {}),
    },
    include: INVOICE_INCLUDE,
  })

  return { ok: true, sent, to, invoice: serializeInvoice(updated) }
})
