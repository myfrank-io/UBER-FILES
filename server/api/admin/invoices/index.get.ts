import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  INVOICE_INCLUDE,
  loadIssuer,
  loadProducts,
  missingIssuerFields,
  serializeInvoice,
  suggestNextNumber,
} from '~/server/utils/invoice'

// Liste des factures pour l'écran d'administration, avec de quoi en ouvrir une
// nouvelle sans second aller-retour (numéro suggéré, identité de l'émetteur,
// chauffeurs à qui facturer).
const query = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'CANCELLED']).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = query.safeParse(getQuery(event))
  if (!q.success) throw createError({ statusCode: 400, statusMessage: 'Filtre invalide.' })
  const { q: search, status } = q.data

  const [invoices, issuer, drivers, suggestedNumber, products] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: 'insensitive' as const } },
                { clientName: { contains: search, mode: 'insensitive' as const } },
                { clientSiret: { contains: search } },
              ],
            }
          : {}),
      },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    loadIssuer(),
    prisma.driver.findMany({
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, companyName: true, siren: true, phone: true, contactEmail: true },
    }),
    suggestNextNumber(),
    loadProducts(),
  ])

  // Chiffres d'en-tête : le total encaissé et ce qui reste à encaisser.
  const paidCents = invoices.filter((i) => i.status === 'PAID').reduce((sum, i) => sum + i.totalCents, 0)
  const pendingCents = invoices.filter((i) => i.status === 'SENT').reduce((sum, i) => sum + i.totalCents, 0)

  return {
    invoices: invoices.map(serializeInvoice),
    suggestedNumber,
    issuer: { ...issuer, missing: missingIssuerFields(issuer) },
    drivers,
    products,
    stats: {
      total: invoices.length,
      draft: invoices.filter((i) => i.status === 'DRAFT').length,
      paidCents,
      pendingCents,
    },
  }
})
