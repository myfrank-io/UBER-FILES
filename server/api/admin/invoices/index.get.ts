import { z } from 'zod'
import { requireAdmin } from '~/server/utils/auth'
import { prisma } from '~/server/utils/prisma'
import {
  INVOICE_INCLUDE,
  loadIssuer,
  loadProducts,
  missingIssuerFields,
  serializeInvoice,
  SETTLEMENT_SELECT,
  suggestNextNumber,
  type SettlementRow,
} from '~/server/utils/invoice'
import { cashPosition } from '~/lib/invoice'

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

  const [invoices, issuer, drivers, suggestedNumber, products, allInvoices] = await Promise.all([
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
    // Les chiffres d'en-tête décrivent TOUT le livre de factures, pas la liste
    // filtrée : sinon la trésorerie changerait en tapant dans la recherche.
    prisma.invoice.findMany({ select: { status: true, ...SETTLEMENT_SELECT } }),
  ])

  const cash = cashPosition(allInvoices as SettlementRow[])

  return {
    invoices: invoices.map(serializeInvoice),
    suggestedNumber,
    issuer: { ...issuer, missing: missingIssuerFields(issuer) },
    drivers,
    products,
    stats: {
      total: allInvoices.length,
      draft: allInvoices.filter((i) => i.status === 'DRAFT').length,
      // Encaissé / à recevoir au sens des ÉCHÉANCES : une facture réglée en
      // partie compte pour ce qu'elle a rapporté, pas tout ou rien.
      paidCents: cash.collectedCents,
      pendingCents: cash.outstandingCents,
      draftCents: cash.draftCents,
    },
  }
})
