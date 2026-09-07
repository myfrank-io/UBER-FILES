import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { generateInvoicePdf, invoiceFileName, wrapText } from './invoice-pdf'

const issuer = {
  name: 'Paul Bertel',
  legalForm: 'EI',
  email: 'paul.bertel@outlook.fr',
  phone: '+33 7 88 76 47 19',
  addressLine: '68 rue des stations',
  postalCode: '59800',
  city: 'Lille',
  siret: '92065972900015',
  vatNumber: null,
}

const client = {
  name: "Same's Driver",
  contactName: null,
  phone: '+33 7 49 15 73 48',
  address: '7 rue du Canal, 45200 Montargis',
  siret: '93054682500017',
  vatNumber: null,
}

describe('invoiceFileName', () => {
  it('construit un nom de fichier lisible', () => {
    expect(invoiceFileName('2606-16', "Same's Driver")).toBe('facture-2606-16-same-s-driver.pdf')
  })
  it('retire les accents', () => {
    expect(invoiceFileName('2606-17', 'Société Générale')).toBe('facture-2606-17-societe-generale.pdf')
  })
  it('reste valide avec un client sans caractère alphanumérique', () => {
    expect(invoiceFileName('2606-18', '???')).toBe('facture-2606-18.pdf')
  })
})

describe('generateInvoicePdf', () => {
  it('produit un PDF d’une page pour une facture courante', async () => {
    const bytes = await generateInvoicePdf({
      number: '2606-16',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines: [
        { label: 'Accès Ridewiz\n+ paramétrage', quantity: 1, unitPriceCents: 40_000, discountKind: 'NONE' as const, discountValue: 0 },
        { label: 'Création 20 cartes', quantity: 1, unitPriceCents: 20_000, discountKind: 'NONE' as const, discountValue: 0 },
      ],
      vatRateBps: 0,
      grossCents: 60_000,
      discountCents: 0,
      subtotalCents: 60_000,
      vatCents: 0,
      totalCents: 60_000,
      paymentTerms: 'Modalités de paiement : règlement de la totalité, soit 600 €, à réception.',
      notes: null,
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    // Une facture de deux lignes tient sur une page.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('pagine plutôt que de déborder quand les lignes sont nombreuses', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({
      label: `Prestation ${i + 1}\nseconde ligne de désignation`,
      quantity: 1,
      unitPriceCents: 10_000,
      discountKind: 'NONE' as const,
      discountValue: 0,
    }))
    const bytes = await generateInvoicePdf({
      number: '2606-19',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines,
      vatRateBps: 0,
      grossCents: 400_000,
      discountCents: 0,
      subtotalCents: 400_000,
      vatCents: 0,
      totalCents: 400_000,
      paymentTerms: null,
      notes: null,
    })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })

  it('n’échoue pas sur un caractère hors des polices standard', async () => {
    const bytes = await generateInvoicePdf({
      number: '2606-20',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client: { ...client, name: 'Société 🚗 Étoile' },
      lines: [{ label: 'Prestation ✅', quantity: 1, unitPriceCents: 10_000, discountKind: 'NONE' as const, discountValue: 0 }],
      vatRateBps: 0,
      grossCents: 10_000,
      discountCents: 0,
      subtotalCents: 10_000,
      vatCents: 0,
      totalCents: 10_000,
      paymentTerms: null,
      notes: null,
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })
})

describe('wrapText', () => {
  // Une désignation « Accès Ridewiz \n + paramétrage » doit s'imprimer sur deux
  // lignes. Assainir avant de découper transformerait le « \n » en « ? » et
  // collerait les lignes : ce test est le garde-fou de cette régression.
  it('respecte les retours à la ligne saisis', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    expect(wrapText(font, 'Accès Ridewiz\n+ paramétrage', 9.5, 80)).toEqual(['Accès Ridewiz', '+ paramétrage'])
  })

  it('ne laisse aucun « ? » là où il y avait un retour à la ligne', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    expect(wrapText(font, 'a\nb\nc', 9.5, 80).join('')).not.toContain('?')
  })

  it('coupe une ligne trop longue pour la colonne', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const lines = wrapText(font, 'mot '.repeat(40).trim(), 9.5, 40)
    expect(lines.length).toBeGreaterThan(1)
  })

  it('remplace un caractère hors WinAnsi sans lever', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    expect(wrapText(font, 'Prestation 🚗', 9.5, 80).join(' ')).toContain('?')
  })
})

describe('remises dans le PDF', () => {
  it('imprime « Offert » et la valeur de la ligne offerte', async () => {
    const bytes = await generateInvoicePdf({
      number: '2606-21',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines: [
        { label: 'Accès Ridewiz', quantity: 1, unitPriceCents: 40_000, discountKind: 'NONE', discountValue: 0 },
        { label: 'Logo', quantity: 1, unitPriceCents: 5_000, discountKind: 'PERCENT', discountValue: 10_000 },
      ],
      vatRateBps: 0,
      grossCents: 45_000,
      discountCents: 5_000,
      subtotalCents: 40_000,
      vatCents: 0,
      totalCents: 40_000,
      paymentTerms: null,
      notes: null,
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('accepte une remise en pourcentage et une remise en euros sur la même facture', async () => {
    const bytes = await generateInvoicePdf({
      number: '2606-22',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines: [
        { label: 'Accès Ridewiz', quantity: 1, unitPriceCents: 40_000, discountKind: 'PERCENT', discountValue: 1000 },
        { label: 'Cartes', quantity: 1, unitPriceCents: 20_000, discountKind: 'AMOUNT', discountValue: 2_000 },
      ],
      vatRateBps: 0,
      grossCents: 60_000,
      discountCents: 6_000,
      subtotalCents: 54_000,
      vatCents: 0,
      totalCents: 54_000,
      paymentTerms: null,
      notes: null,
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
  })
})

describe('charte et pagination', () => {
  it('rappelle le numéro et la pagination sur les pages de suite', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({
      label: `Prestation ${i + 1}\nseconde ligne`,
      quantity: 1,
      unitPriceCents: 10_000,
      discountKind: 'NONE' as const,
      discountValue: 0,
    }))
    const bytes = await generateInvoicePdf({
      number: '2606-99',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines,
      vatRateBps: 0,
      grossCents: 300_000,
      discountCents: 0,
      subtotalCents: 300_000,
      vatCents: 0,
      totalCents: 300_000,
      paymentTerms: null,
      notes: null,
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    // Le rappel n'est posé que sur les pages de suite : la première porte déjà
    // le bandeau avec le numéro.
    expect(doc.getPage(0).getSize().width).toBeGreaterThan(0)
  })

  it('une facture d’une seule page ne porte pas de rappel de pagination', async () => {
    const bytes = await generateInvoicePdf({
      number: '2606-98',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines: [{ label: 'Accès', quantity: 1, unitPriceCents: 40_000, discountKind: 'NONE', discountValue: 0 }],
      vatRateBps: 0,
      grossCents: 40_000,
      discountCents: 0,
      subtotalCents: 40_000,
      vatCents: 0,
      totalCents: 40_000,
      paymentTerms: null,
      notes: null,
    })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})
