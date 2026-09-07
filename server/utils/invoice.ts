// Facturation : accès aux données et mise en forme, entre Prisma et les routes
// admin. La logique de calcul vit dans lib/invoice.ts, le dessin du PDF dans
// server/utils/invoice-pdf.ts.
import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from './prisma'
import type { InvoiceRenderInput } from './invoice-pdf'
import {
  formatEuros,
  invoiceSettlement,
  invoiceTotals,
  lineDiscountCents,
  lineGrossCents,
  lineNetCents,
  nextInvoiceNumber,
  shareBasisPoints,
  statusFromInstallments,
  type DiscountKind,
  type InstallmentInput,
  type InvoiceStatusLike,
} from '~/lib/invoice'

/** Une facture chargée avec tout ce qui s'imprime dessus. */
export const INVOICE_INCLUDE = {
  lines: { orderBy: { position: 'asc' as const } },
  installments: { orderBy: { position: 'asc' as const } },
  driver: { select: { id: true, displayName: true, slug: true } },
} as const

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>

/**
 * Identité de l'émetteur. Une seule ligne, créée vide au premier accès : la
 * facturation reste utilisable avant d'avoir renseigné quoi que ce soit, et
 * l'écran d'édition signale ce qui manque.
 */
export async function loadIssuer() {
  return prisma.invoiceIssuer.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })
}

/** DTO d'un produit du catalogue. */
export function serializeProduct(product: {
  id: string
  name: string
  label: string
  unitPriceCents: number
  position: number
}) {
  return {
    id: product.id,
    name: product.name,
    label: product.label,
    unitPriceCents: product.unitPriceCents,
    position: product.position,
  }
}

/** Catalogue complet, dans l'ordre d'affichage. */
export async function loadProducts() {
  const products = await prisma.invoiceProduct.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
  return products.map(serializeProduct)
}

/** Champs sans lesquels une facture ne serait pas conforme. */
export function missingIssuerFields(issuer: { name: string; addressLine: string; city: string; siret: string }) {
  const missing: string[] = []
  if (!issuer.name.trim()) missing.push('le nom')
  if (!issuer.addressLine.trim() || !issuer.city.trim()) missing.push('l’adresse')
  if (!issuer.siret.trim()) missing.push('le SIRET')
  return missing
}

/** Numéro proposé pour la prochaine facture : la suite de la série en cours. */
export async function suggestNextNumber(): Promise<string> {
  const last = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { number: true },
  })
  if (last) return nextInvoiceNumber(last.number)
  const issuer = await loadIssuer()
  return nextInvoiceNumber(issuer.numberPrefix || null)
}

/** JJ/MM/AAAA — les factures sont émises depuis la France. */
export function formatInvoiceDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/**
 * Jeton du lien public, créé à la première demande puis stable : le PDF est
 * régénéré à chaque ouverture, le lien reste donc valable après une correction
 * de la facture.
 */
export async function ensureInvoiceShareToken(invoice: { id: string; shareToken: string | null }): Promise<string> {
  if (invoice.shareToken) return invoice.shareToken
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { shareToken: randomBytes(18).toString('base64url') },
    select: { shareToken: true },
  })
  return updated.shareToken!
}

/** DTO renvoyé au client : jamais l'entité Prisma brute. */
export function serializeInvoice(invoice: InvoiceWithRelations) {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    driver: invoice.driver ? { id: invoice.driver.id, displayName: invoice.driver.displayName } : null,
    client: {
      name: invoice.clientName,
      contactName: invoice.clientContactName,
      email: invoice.clientEmail,
      phone: invoice.clientPhone,
      address: invoice.clientAddress,
      siret: invoice.clientSiret,
      vatNumber: invoice.clientVatNumber,
    },
    issuedAt: invoice.issuedAt,
    issuedAtLabel: formatInvoiceDate(invoice.issuedAt),
    dueDate: invoice.dueDate,
    vatRateBps: invoice.vatRateBps,
    subtotalCents: invoice.subtotalCents,
    vatCents: invoice.vatCents,
    totalCents: invoice.totalCents,
    paymentTerms: invoice.paymentTerms,
    notes: invoice.notes,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      label: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discountKind: line.discountKind,
      discountValue: line.discountValue,
      grossCents: lineGrossCents(line),
      discountCents: lineDiscountCents(line),
      amountCents: lineNetCents(line),
    })),
    installments: invoice.installments.map((part) => ({
      id: part.id,
      shareBps: part.shareBps,
      dueLabel: part.dueLabel,
      amountCents: part.amountCents,
      paidAt: part.paidAt,
    })),
    // Encaissé / restant, calculé ici pour que tous les écrans affichent le
    // même chiffre sans le recalculer chacun à sa façon.
    settlement: invoiceSettlement(invoice),
    sentAt: invoice.sentAt,
    sentCount: invoice.sentCount,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  }
}

/**
 * Sélection minimale pour calculer une position de trésorerie : inutile de
 * charger les lignes et le client pour additionner des échéances.
 */
export const SETTLEMENT_SELECT = {
  status: true,
  totalCents: true,
  installments: { select: { amountCents: true, paidAt: true }, orderBy: { position: 'asc' as const } },
} as const

/** Facture réduite à ce que le calcul de règlement lit. */
export type SettlementRow = {
  status: InvoiceStatusLike
  totalCents: number
  installments: { amountCents: number; paidAt: Date | null }[]
}

/**
 * Applique à une facture le statut que ses encaissements imposent, et remet
 * `paidAt` en cohérence. Renvoie la facture rechargée.
 *
 * Appelé après chaque cochage : le statut de la facture est une CONSÉQUENCE des
 * échéances, jamais une saisie parallèle qui pourrait les contredire.
 */
export async function syncInvoiceStatus(invoiceId: string): Promise<InvoiceWithRelations> {
  const invoice = await findInvoiceOr404(invoiceId)
  const status = statusFromInstallments(invoice)
  if (status === invoice.status) return invoice
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === 'PAID' ? (invoice.paidAt ?? new Date()) : null },
    include: INVOICE_INCLUDE,
  })
}

/** Le contenu modifiable d'une facture, partagé par la création et la mise à jour. */
export interface InvoiceContent {
  driverId: string | null
  clientName: string
  clientContactName: string | null
  clientEmail: string | null
  clientPhone: string | null
  clientAddress: string | null
  clientSiret: string | null
  clientVatNumber: string | null
  issuedAt: Date
  dueDate: Date | null
  vatRateBps: number
  lines: { label: string; quantity: number; unitPriceCents: number; discountKind: DiscountKind; discountValue: number }[]
  installments: InstallmentInput[]
  paymentTerms: string | null
  notes: string | null
}

/**
 * Traduit le contenu saisi en écriture Prisma : totaux recalculés côté serveur
 * (jamais ceux envoyés par le client). Les échéances portent des MONTANTS ;
 * la part en pour-cent n'est stockée que pour information, déduite du montant.
 */
export function invoiceWriteData(content: InvoiceContent) {
  const { subtotalCents, vatCents, totalCents } = invoiceTotals(content.lines, content.vatRateBps)
  const installments = content.installments
  return {
    invoice: {
      driverId: content.driverId,
      clientName: content.clientName,
      clientContactName: content.clientContactName,
      clientEmail: content.clientEmail,
      clientPhone: content.clientPhone,
      clientAddress: content.clientAddress,
      clientSiret: content.clientSiret,
      clientVatNumber: content.clientVatNumber,
      issuedAt: content.issuedAt,
      dueDate: content.dueDate,
      vatRateBps: content.vatRateBps,
      subtotalCents,
      vatCents,
      totalCents,
      paymentTerms: content.paymentTerms,
      notes: content.notes,
    },
    lines: content.lines.map((line, position) => ({ ...line, position })),
    installments: installments.map((part, position) => ({
      position,
      shareBps: shareBasisPoints(part.amountCents, totalCents),
      dueLabel: part.dueLabel,
      amountCents: part.amountCents,
    })),
  }
}

/** Tout ce dont le générateur PDF a besoin, sans qu'il touche à Prisma. */
export function toRenderInput(
  invoice: InvoiceWithRelations,
  issuer: Awaited<ReturnType<typeof loadIssuer>>,
): InvoiceRenderInput {
  return {
    number: invoice.number,
    issuedAtLabel: formatInvoiceDate(invoice.issuedAt),
    dueDateLabel: invoice.dueDate ? formatInvoiceDate(invoice.dueDate) : null,
    issuer: {
      name: issuer.name,
      legalForm: issuer.legalForm,
      email: issuer.email,
      phone: issuer.phone,
      addressLine: issuer.addressLine,
      postalCode: issuer.postalCode,
      city: issuer.city,
      siret: issuer.siret,
      vatNumber: issuer.vatNumber,
    },
    client: {
      name: invoice.clientName,
      contactName: invoice.clientContactName,
      phone: invoice.clientPhone,
      address: invoice.clientAddress,
      siret: invoice.clientSiret,
      vatNumber: invoice.clientVatNumber,
    },
    lines: invoice.lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discountKind: line.discountKind,
      discountValue: line.discountValue,
    })),
    vatRateBps: invoice.vatRateBps,
    grossCents: invoice.lines.reduce((sum, line) => sum + lineGrossCents(line), 0),
    discountCents: invoice.lines.reduce((sum, line) => sum + lineDiscountCents(line), 0),
    subtotalCents: invoice.subtotalCents,
    vatCents: invoice.vatCents,
    totalCents: invoice.totalCents,
    paymentTerms: invoice.paymentTerms,
    notes: invoice.notes,
  }
}

/** Facture complète ou 404. */
export async function findInvoiceOr404(id: string): Promise<InvoiceWithRelations> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE })
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Facture introuvable.' })
  return invoice
}

/** Champ texte facultatif : une chaîne vide vaut « non renseigné ». */
function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().default(null),
  )
}

/**
 * Contenu modifiable d'une facture, partagé par la création et la mise à jour.
 * Les totaux ne sont jamais acceptés depuis le client : ils sont recalculés.
 */
export const invoiceContentSchema = z
  .object({
    driverId: z.string().cuid().nullable().default(null),
    clientName: z.string().trim().min(2, 'Indiquez le nom du client.').max(200),
    clientContactName: optionalText(200),
    clientEmail: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().email('L’email du client est invalide.').nullable().default(null),
    ),
    clientPhone: optionalText(40),
    clientAddress: optionalText(400),
    clientSiret: optionalText(20),
    clientVatNumber: optionalText(30),
    issuedAt: z.coerce.date(),
    dueDate: z.coerce.date().nullable().default(null),
    vatRateBps: z.number().int().min(0).max(10_000).default(0),
    lines: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Chaque ligne doit avoir une désignation.').max(500),
          quantity: z.number().int().min(1).max(10_000),
          unitPriceCents: z.number().int().min(0).max(100_000_000),
          discountKind: z.enum(['NONE', 'PERCENT', 'AMOUNT']).default('NONE'),
          // Centièmes de pour-cent si PERCENT (10000 = offert), centimes si AMOUNT.
          discountValue: z.number().int().min(0).max(100_000_000).default(0),
        }),
      )
      .min(1, 'Ajoutez au moins une ligne à la facture.')
      .max(50, 'Une facture est limitée à 50 lignes.'),
    installments: z
      .array(
        z.object({
          amountCents: z.number().int().min(0).max(100_000_000),
          dueLabel: z.string().trim().max(120),
        }),
      )
      .max(12, 'Douze échéances au maximum.')
      .default([]),
    paymentTerms: optionalText(2000),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.installments.length === 0) return
    // Les échéances doivent couvrir le total au centime près : une facture dont
    // les règlements ne tombent pas juste est un litige garanti.
    const total = invoiceTotals(value.lines, value.vatRateBps).totalCents
    const scheduled = value.installments.reduce((sum, part) => sum + part.amountCents, 0)
    if (scheduled !== total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Les échéances totalisent ${formatEuros(scheduled)} au lieu de ${formatEuros(total)}.`,
        path: ['installments'],
      })
    }
  })
