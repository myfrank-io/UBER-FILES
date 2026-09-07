import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  INVOICE_INCLUDE,
  invoiceContentSchema,
  invoiceWriteData,
  serializeInvoice,
  suggestNextNumber,
} from '~/server/utils/invoice'

// Création d'une facture. Le numéro est fourni par l'admin (il continue sa
// série existante) ; sans numéro, on propose la suite de la dernière facture.
const schema = z.object({
  number: z.string().trim().min(1, 'Indiquez un numéro de facture.').max(40).optional(),
  content: invoiceContentSchema,
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readValidatedBody(event, (b) => schema.safeParse(b))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: body.error.errors.map((e) => e.message).join(' '),
    })
  }

  const number = body.data.number ?? (await suggestNextNumber())
  const { invoice, lines, installments } = invoiceWriteData(body.data.content)

  if (invoice.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: invoice.driverId }, select: { id: true } })
    if (!driver) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })
  }

  const existing = await prisma.invoice.findUnique({ where: { number }, select: { id: true } })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: `La facture n°${number} existe déjà.` })
  }

  const created = await prisma.invoice.create({
    data: {
      ...invoice,
      number,
      lines: { create: lines },
      installments: { create: installments },
    },
    include: INVOICE_INCLUDE,
  })

  return { ok: true, invoice: serializeInvoice(created) }
})
