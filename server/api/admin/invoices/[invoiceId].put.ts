import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  INVOICE_INCLUDE,
  findInvoiceOr404,
  invoiceContentSchema,
  invoiceWriteData,
  serializeInvoice,
  syncInvoiceStatus,
} from '~/server/utils/invoice'

// Mise à jour complète d'une facture. Lignes et échéances sont remplacées d'un
// bloc : c'est le contenu de l'écran qui fait foi, pas un diff.
const schema = z.object({
  number: z.string().trim().min(1, 'Indiquez un numéro de facture.').max(40),
  content: invoiceContentSchema,
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'invoiceId')!
  const current = await findInvoiceOr404(id)

  if (current.status === 'CANCELLED') {
    throw createError({ statusCode: 422, statusMessage: 'Une facture annulée ne se modifie plus.' })
  }

  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const { number } = body.data
  if (number !== current.number) {
    const clash = await prisma.invoice.findUnique({ where: { number }, select: { id: true } })
    if (clash) throw createError({ statusCode: 409, statusMessage: `La facture n°${number} existe déjà.` })
  }

  const { invoice, lines, installments } = invoiceWriteData(body.data.content)
  if (invoice.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: invoice.driverId }, select: { id: true } })
    if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })
  }

  // Les échéances sont recréées, mais les ENCAISSEMENTS déjà constatés ne
  // doivent pas disparaître parce qu'on a corrigé une ligne. On les reporte par
  // RANG : la 1re échéance reste la 1re, même si son montant ou son libellé a
  // changé. Une échéance supprimée emporte son encaissement — c'est le seul cas
  // où l'admin perd l'information, et il l'a demandé explicitement.
  const paidByPosition = new Map(current.installments.map((part) => [part.position, part.paidAt]))
  const withPayments = installments.map((part) => ({ ...part, paidAt: paidByPosition.get(part.position) ?? null }))

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } })
    await tx.invoiceInstallment.deleteMany({ where: { invoiceId: id } })
    return tx.invoice.update({
      where: { id },
      data: {
        ...invoice,
        number,
        lines: { create: lines },
        installments: { create: withPayments },
      },
      include: INVOICE_INCLUDE,
    })
  })

  // Changer l'échéancier peut solder ou dé-solder la facture (passer de 2 à 3
  // échéances laisse la 3e impayée) : le statut est recalculé, jamais laissé
  // en contradiction avec les encaissements.
  return { ok: true, invoice: serializeInvoice(await syncInvoiceStatus(updated.id)) }
})
