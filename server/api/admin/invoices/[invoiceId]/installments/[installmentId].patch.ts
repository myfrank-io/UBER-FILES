import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import { serializeInvoice, syncInvoiceStatus } from '~/server/utils/invoice'

// Encaissement d'UNE échéance : la case que l'admin coche quand l'argent est
// arrivé. Le statut de la facture en découle (toutes cochées → payée, une
// décochée → en attente) ; il n'est jamais saisi en parallèle.
const schema = z.object({ paid: z.boolean() })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const invoiceId = getRouterParam(event, 'invoiceId')!
  const installmentId = getRouterParam(event, 'installmentId')!

  // L'échéance doit appartenir à la facture de l'URL : sans ce contrôle, un id
  // d'échéance suffirait à toucher n'importe quelle facture.
  const installment = await prisma.invoiceInstallment.findFirst({
    where: { id: installmentId, invoiceId },
    select: { id: true, invoice: { select: { status: true } } },
  })
  if (!installment) throw createError({ statusCode: 404, statusMessage: 'Échéance introuvable.' })
  if (installment.invoice.status === 'CANCELLED') {
    throw createError({ statusCode: 422, statusMessage: 'Une facture annulée ne s’encaisse plus.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'Requête invalide.' })

  await prisma.invoiceInstallment.update({
    where: { id: installmentId },
    data: { paidAt: body.data.paid ? new Date() : null },
  })

  return { ok: true, invoice: serializeInvoice(await syncInvoiceStatus(invoiceId)) }
})
