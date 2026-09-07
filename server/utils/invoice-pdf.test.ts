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
        { label: 'Accès Ridewiz\n+ paramétrage', quantity: 1, unitPriceCents: 40_000 },
        { label: 'Création 20 cartes', quantity: 1, unitPriceCents: 20_000 },
      ],
      vatRateBps: 0,
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
    }))
    const bytes = await generateInvoicePdf({
      number: '2606-19',
      issuedAtLabel: '07/09/2026',
      dueDateLabel: null,
      issuer,
      client,
      lines,
      vatRateBps: 0,
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
      lines: [{ label: 'Prestation ✅', quantity: 1, unitPriceCents: 10_000 }],
      vatRateBps: 0,
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
