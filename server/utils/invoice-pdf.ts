// PDF d'une facture (pdf-lib, pur JavaScript : aucun navigateur headless sur
// Vercel — même choix que le PDF des cartes NFC). Une page A4 par facture,
// reprenant la mise en page des factures déjà envoyées aux chauffeurs :
// en-tête numéro/émetteur, bloc client, tableau désignation/montant, totaux,
// mentions légales, bandeau d'identité en pied de page.
//
// Aucun accès Prisma ici : tout arrive résolu dans `InvoiceRenderInput`.
import { LineCapStyle, PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from 'pdf-lib'
import {
  LATE_PAYMENT_MENTION,
  discountLabel,
  formatEuros,
  isLineFree,
  lineNetCents,
  vatMention,
  type DiscountKind,
} from '~/lib/invoice'

const MM = 72 / 25.4

// Géométrie de la page, en millimètres.
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - 2 * MARGIN
/** Colonne des quantités (alignée à gauche) et bord droit des montants. */
const QTY_X = 118
const RIGHT_X = PAGE_W - MARGIN
/** Largeur maximale d'une désignation avant retour à la ligne. */
const LABEL_W = QTY_X - MARGIN - 6
/** Hauteur du bandeau nuit qui coiffe la première page. */
const BAND_H = 34
/** Le contenu ne descend jamais dans le bandeau de pied de page. */
const CONTENT_BOTTOM = 246
const FOOTER_TOP = 252

// Charte Ridewiz « Signature » — mêmes valeurs que tailwind.config.ts.
const NIGHT = rgb(0x0e / 255, 0x1b / 255, 0x2c / 255) // #0E1B2C
const GOLD = rgb(0xe0 / 255, 0xb5 / 255, 0x79 / 255) // #E0B579
const COPPER = rgb(0xb5 / 255, 0x79 / 255, 0x3f / 255) // #B5793F
const CREAM = rgb(0xf1 / 255, 0xea / 255, 0xdb / 255) // #F1EADB
const INK = rgb(0x16 / 255, 0x28 / 255, 0x3d / 255) // #16283D
const LABEL = rgb(0x9a / 255, 0x8b / 255, 0x72 / 255) // #9A8B72
const MUTED = rgb(0x6c / 255, 0x78 / 255, 0x89 / 255) // #6C7889
const RULE = rgb(0xe4 / 255, 0xdc / 255, 0xcc / 255) // #E4DCCC
const WHITE = rgb(1, 1, 1)
/** Les montants portent le cuivre de la charte. */
const AMOUNT = COPPER

export interface InvoiceRenderLine {
  label: string
  quantity: number
  unitPriceCents: number
  discountKind: DiscountKind
  discountValue: number
}

export interface InvoiceRenderInput {
  number: string
  /** Date d'émission déjà formatée (JJ/MM/AAAA) : le fuseau est résolu en amont. */
  issuedAtLabel: string
  dueDateLabel: string | null
  issuer: {
    name: string
    legalForm: string
    email: string
    phone: string
    addressLine: string
    postalCode: string
    city: string
    siret: string
    vatNumber: string | null
  }
  client: {
    name: string
    contactName: string | null
    phone: string | null
    address: string | null
    siret: string | null
    vatNumber: string | null
  }
  lines: InvoiceRenderLine[]
  vatRateBps: number
  /** Montant des lignes avant remises. */
  grossCents: number
  /** Total des remises accordées, 0 s'il n'y en a aucune. */
  discountCents: number
  subtotalCents: number
  vatCents: number
  totalCents: number
  paymentTerms: string | null
  notes: string | null
}

/**
 * Texte encodable par les polices standard (WinAnsi) : un caractère hors table
 * ferait échouer tout le PDF, on le remplace plutôt que de casser l'envoi.
 */
function safeText(font: PDFFont, s: string): string {
  let out = ''
  for (const ch of s) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      out += '?'
    }
  }
  return out
}

/**
 * Picto Ridewiz (public/favicon.svg) redessiné en vectoriel : carré nuit à
 * coins arrondis, itinéraire A→B en or. Vectoriel plutôt qu'une image : net à
 * toute taille, aucun fichier à embarquer, et la charte reste la seule source.
 *
 * Le dessin source tient dans une boîte de 64 ; le groupe intérieur y est posé
 * en (15, 15) à l'échelle 34/32, avec un viewBox commençant à y = -2 — d'où
 * l'origine décalée du groupe.
 */
function drawRidewizLogo(page: PDFPage, leftMm: number, topMm: number, sizeMm: number, withPlate = true) {
  const left = leftMm * MM
  const top = (PAGE_H - topMm) * MM

  if (withPlate) {
    // Carré nuit à coins arrondis (r = 14 dans la boîte de 64).
    const s = (sizeMm / 64) * MM
    page.drawSvgPath(
      'M14 0 H50 A14 14 0 0 1 64 14 V50 A14 14 0 0 1 50 64 H14 A14 14 0 0 1 0 50 V14 A14 14 0 0 1 14 0 Z',
      { x: left, y: top, scale: s, color: NIGHT },
    )
  }

  // Marque seule : sur un fond déjà nuit, la plaque serait invisible et ne
  // ferait que rétrécir le picto. On cale alors l'itinéraire sur toute la boîte.
  const markBox = withPlate ? sizeMm * (34 / 64) : sizeMm
  const offset = withPlate ? (15 / 64) * sizeMm : 0
  // Le dessin source tient dans « 0 -2 32 32 » : 32 de large, 32 de haut.
  const gs = (markBox / 32) * MM
  const gx = left + offset * MM
  const gy = top - offset * MM + 2 * gs

  const circle = (cx: number, cy: number, r: number) =>
    `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`

  // Point de départ plein, point d'arrivée en anneau, itinéraire entre les deux.
  page.drawSvgPath(circle(7, 24, 3.1), { x: gx, y: gy, scale: gs, color: GOLD })
  page.drawSvgPath(circle(25, 3.5, 3.1), {
    x: gx,
    y: gy,
    scale: gs,
    borderColor: GOLD,
    borderWidth: 2.2 * gs,
  })
  page.drawSvgPath('M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8', {
    x: gx,
    y: gy,
    scale: gs,
    borderColor: GOLD,
    borderWidth: 2.2 * gs,
    borderLineCap: LineCapStyle.Round,
  })
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  /** Serif éditorial de la charte, réservé aux titres et aux prix. */
  serifBold: PDFFont
}

/**
 * Découpe un texte pour qu'il tienne dans `maxW` (mm). Les retours à la ligne
 * saisis sont conservés : une désignation « Accès Ridewiz \n + paramétrage »
 * s'imprime sur deux lignes, comme elle a été écrite.
 */
export function wrapText(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = []
  // Le découpage sur les retours à la ligne vient EN PREMIER : « \n » n'est pas
  // encodable en WinAnsi, l'assainir d'abord le transformerait en « ? » et
  // collerait les lignes d'une désignation. Chaque ligne est ensuite assainie
  // avant d'être mesurée, car widthOfTextAtSize lève sur un caractère hors
  // table (un emoji ferait échouer tout le PDF).
  for (const rawParagraph of text.split('\n')) {
    const paragraph = safeText(font, rawParagraph)
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxW * MM || !current) {
        current = candidate
      } else {
        out.push(current)
        current = word
      }
    }
    out.push(current)
  }
  return out
}

/** Feuille de dessin : coordonnées en mm depuis le coin haut-gauche. */
class Sheet {
  page: PDFPage
  /** Position verticale courante, en mm depuis le haut. */
  y = MARGIN

  constructor(
    private pdf: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = pdf.addPage([PAGE_W * MM, PAGE_H * MM])
  }

  private at(yMm: number) {
    return (PAGE_H - yMm) * MM
  }

  text(s: string, x: number, yMm: number, size: number, font: PDFFont, color: RGB = INK) {
    this.page.drawText(safeText(font, s), { x: x * MM, y: this.at(yMm), size, font, color })
  }

  /** Texte aligné à droite sur `xRight`. */
  textRight(s: string, xRight: number, yMm: number, size: number, font: PDFFont, color: RGB = INK) {
    const safe = safeText(font, s)
    const w = font.widthOfTextAtSize(safe, size) / MM
    this.page.drawText(safe, { x: (xRight - w) * MM, y: this.at(yMm), size, font, color })
  }

  rule(yMm: number, thickness = 0.4, color: RGB = RULE, from = MARGIN, to = RIGHT_X) {
    this.page.drawLine({
      start: { x: from * MM, y: this.at(yMm) },
      end: { x: to * MM, y: this.at(yMm) },
      thickness,
      color,
    })
  }

  /** Bloc de texte multiligne ; renvoie la position sous le dernier interligne. */
  paragraph(s: string, x: number, yMm: number, size: number, font: PDFFont, maxW: number, color: RGB = INK) {
    const leading = (size * 1.35) / MM
    let y = yMm
    for (const line of wrapText(font, s, size, maxW)) {
      this.text(line, x, y, size, font, color)
      y += leading
    }
    return y
  }

  /** Ouvre une page supplémentaire quand le contenu déborde. */
  nextPage() {
    this.page = this.pdf.addPage([PAGE_W * MM, PAGE_H * MM])
    this.y = MARGIN
  }
}

/**
 * En-tête : bandeau nuit pleine largeur, picto et nom Ridewiz à gauche, numéro
 * de facture et date à droite. L'identité légale de l'émetteur reste en pied de
 * page, où elle est complète.
 */
function drawHeader(sheet: Sheet, fonts: Fonts, input: InvoiceRenderInput) {
  sheet.page.drawRectangle({
    x: 0,
    y: (PAGE_H - BAND_H) * MM,
    width: PAGE_W * MM,
    height: BAND_H * MM,
    color: NIGHT,
  })
  // Filet or au pied du bandeau, comme la ligne d'accent de la charte.
  sheet.page.drawRectangle({
    x: 0,
    y: (PAGE_H - BAND_H) * MM,
    width: PAGE_W * MM,
    height: 0.8 * MM,
    color: GOLD,
  })

  const logoSize = 11
  const logoTop = (BAND_H - logoSize) / 2 - 1
  drawRidewizLogo(sheet.page, MARGIN, logoTop, logoSize, false)
  sheet.text('Ridewiz', MARGIN + logoSize + 5, logoTop + logoSize - 1.2, 19, fonts.serifBold, GOLD)

  sheet.textRight(`FACTURE N°${input.number}`, RIGHT_X, 16, 15, fonts.bold, WHITE)
  const dates = input.dueDateLabel
    ? `${input.issuedAtLabel} · échéance ${input.dueDateLabel}`
    : input.issuedAtLabel
  sheet.textRight(dates, RIGHT_X, 22.5, 8.5, fonts.regular, GOLD)
}

/** Bloc client : raison sociale à gauche, coordonnées en deux colonnes à droite. */
function drawClient(sheet: Sheet, fonts: Fonts, input: InvoiceRenderInput) {
  sheet.y = 50
  const top = sheet.y
  let leftY = sheet.y
  leftY = sheet.paragraph(input.client.name.toUpperCase(), MARGIN, leftY, 12, fonts.bold, 60)
  if (input.client.contactName) {
    sheet.paragraph(input.client.contactName.toUpperCase(), MARGIN, leftY, 12, fonts.bold, 60)
  }

  // Colonne de droite : libellé en gras, valeur alignée sur une même colonne.
  const labelX = 92
  const valueX = 118
  const rows: [string, string][] = []
  if (input.client.phone) rows.push(['Téléphone', input.client.phone])
  if (input.client.address) rows.push(['Adresse', input.client.address])
  if (input.client.siret) rows.push(['Siret', input.client.siret])
  if (input.client.vatNumber) rows.push(['TVA', input.client.vatNumber])

  let rightY = top
  for (const [label, value] of rows) {
    sheet.text(label, labelX, rightY, 8.5, fonts.bold, LABEL)
    rightY = sheet.paragraph(value, valueX, rightY, 8.5, fonts.regular, RIGHT_X - valueX)
    rightY += 1.2
  }

  sheet.y = Math.max(leftY, rightY) + 10
}

/** En-tête du tableau, redessiné en haut de chaque page en cas de débordement. */
function drawTableHead(sheet: Sheet, fonts: Fonts) {
  sheet.rule(sheet.y, 1.1, NIGHT)
  sheet.y += 6
  sheet.text('DÉSIGNATION', MARGIN, sheet.y, 8.5, fonts.bold, LABEL)
  sheet.textRight('MONTANT', RIGHT_X, sheet.y, 8.5, fonts.bold, LABEL)
  sheet.y += 3
  sheet.rule(sheet.y, 1.1, NIGHT)
  sheet.y += 9
}

function drawLines(sheet: Sheet, fonts: Fonts, input: InvoiceRenderInput) {
  drawTableHead(sheet, fonts)
  for (const [index, line] of input.lines.entries()) {
    const wrapped = wrapText(fonts.regular, line.label, 9.5, LABEL_W)
    const blockH = wrapped.length * ((9.5 * 1.4) / MM) + (discountLabel(line) ? (8 * 1.5) / MM : 0) + 9

    if (sheet.y + blockH > CONTENT_BOTTOM) {
      sheet.nextPage()
      sheet.y = 30
      drawTableHead(sheet, fonts)
    }

    const rowTop = sheet.y
    let y = rowTop
    for (const text of wrapped) {
      sheet.text(text, MARGIN, y, 9.5, fonts.regular)
      y += (9.5 * 1.4) / MM
    }
    // Une remise s'annonce sous la désignation : le client doit voir ce qui lui
    // a été consenti, pas seulement un montant plus bas que prévu.
    const discount = discountLabel(line)
    if (discount) {
      sheet.text(discount, MARGIN, y + 0.6, 8, fonts.italic, MUTED)
      y += (8 * 1.5) / MM
    }
    sheet.text(String(line.quantity), QTY_X, rowTop, 9.5, fonts.regular)
    sheet.textRight(
      isLineFree(line) ? 'Offert' : formatEuros(lineNetCents(line)),
      RIGHT_X,
      rowTop,
      9.5,
      fonts.bold,
      AMOUNT,
    )

    sheet.y = Math.max(y, rowTop + 6) + 5
    if (index < input.lines.length - 1) {
      sheet.rule(sheet.y)
      sheet.y += 7
    }
  }
}

function drawTotals(sheet: Sheet, fonts: Fonts, input: InvoiceRenderInput) {
  sheet.y += 3
  sheet.rule(sheet.y)
  sheet.y += 7

  const labelRight = 160
  // Avec des remises, le brut et le montant consenti apparaissent au-dessus du
  // sous-total : sans cela, un « offert » ne se verrait nulle part dans les totaux.
  if (input.discountCents > 0) {
    sheet.textRight('Montant brut', labelRight, sheet.y, 8.5, fonts.regular, MUTED)
    sheet.textRight(formatEuros(input.grossCents), RIGHT_X, sheet.y, 9, fonts.regular, INK)
    sheet.y += 6
    sheet.textRight('Remises', labelRight, sheet.y, 8.5, fonts.regular, MUTED)
    sheet.textRight(`-${formatEuros(input.discountCents)}`, RIGHT_X, sheet.y, 9, fonts.regular, INK)
    sheet.y += 6
  }
  sheet.textRight('Sous-total', labelRight, sheet.y, 8.5, fonts.regular, MUTED)
  sheet.textRight(formatEuros(input.subtotalCents), RIGHT_X, sheet.y, 9, fonts.bold, AMOUNT)
  sheet.y += 6

  if (input.vatRateBps > 0) {
    sheet.textRight(vatMention(input.vatRateBps), labelRight, sheet.y, 8.5, fonts.regular, MUTED)
    sheet.textRight(formatEuros(input.vatCents), RIGHT_X, sheet.y, 9, fonts.bold, AMOUNT)
    sheet.y += 6
  }

  sheet.y += 6
  // La charte réserve le serif aux titres et aux prix : le total en est un.
  sheet.textRight('TOTAL', labelRight, sheet.y, 17, fonts.serifBold, NIGHT)
  sheet.textRight(formatEuros(input.totalCents), RIGHT_X, sheet.y, 18, fonts.serifBold, AMOUNT)
  sheet.y += 6

  // En franchise en base, l'article 293 B du CGI est une mention obligatoire.
  if (input.vatRateBps === 0) {
    sheet.textRight(vatMention(0), RIGHT_X, sheet.y, 7.5, fonts.italic, MUTED)
    sheet.y += 5
  }
  sheet.y += 3
  sheet.rule(sheet.y)
  sheet.y += 8
}

function drawMentions(sheet: Sheet, fonts: Fonts, input: InvoiceRenderInput) {
  if (input.paymentTerms?.trim()) {
    sheet.y = sheet.paragraph(input.paymentTerms.trim(), MARGIN, sheet.y, 7.5, fonts.regular, CONTENT_W, MUTED) + 4
  }
  if (input.notes?.trim()) {
    sheet.y = sheet.paragraph(input.notes.trim(), MARGIN, sheet.y, 7.5, fonts.regular, CONTENT_W, MUTED) + 4
  }
  sheet.y = sheet.paragraph(LATE_PAYMENT_MENTION, MARGIN, sheet.y, 7.5, fonts.regular, CONTENT_W, MUTED)
}

/** Bandeau d'identité de l'émetteur, en pied de la dernière page. */
function drawFooter(sheet: Sheet, fonts: Fonts, input: InvoiceRenderInput) {
  const { issuer } = input
  sheet.page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W * MM,
    height: (PAGE_H - FOOTER_TOP) * MM,
    color: CREAM,
  })
  // Filet or : le même accent qu'en tête de page.
  sheet.page.drawRectangle({
    x: 0,
    y: (PAGE_H - FOOTER_TOP - 0.8) * MM,
    width: PAGE_W * MM,
    height: 0.8 * MM,
    color: GOLD,
  })

  let y = FOOTER_TOP + 12
  const title = issuer.legalForm ? `${issuer.name.toUpperCase()} - ${issuer.legalForm}` : issuer.name.toUpperCase()
  sheet.text(title, MARGIN, y, 12, fonts.bold, NIGHT)
  y += 8

  if (issuer.email) {
    sheet.text(issuer.email, MARGIN, y, 8.5, fonts.regular)
    // Souligné : l'email est le point de contact, comme sur les factures existantes.
    const w = fonts.regular.widthOfTextAtSize(safeText(fonts.regular, issuer.email), 8.5) / MM
    sheet.rule(y + 1.2, 0.4, INK, MARGIN, MARGIN + w)
    y += 7
  }

  const address = [issuer.addressLine, [issuer.postalCode, issuer.city].filter(Boolean).join(' ')]
    .filter((part) => part.trim())
    .join('\n')
  if (address) y = sheet.paragraph(address, MARGIN, y, 8.5, fonts.regular, 90)
  if (issuer.siret) {
    sheet.text(`Siret : ${issuer.siret}`, MARGIN, y, 8.5, fonts.regular)
    y += 4.5
  }
  if (issuer.vatNumber) {
    sheet.text(`TVA : ${issuer.vatNumber}`, MARGIN, y, 8.5, fonts.regular)
    y += 4.5
  }
  if (issuer.phone) sheet.text(issuer.phone, MARGIN, y, 8.5, fonts.regular)
}

/** PDF complet d'une facture. */
export async function generateInvoicePdf(input: InvoiceRenderInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    // DM Serif Display n'est pas embarquable sans fontkit : Times Bold en tient
    // lieu à l'impression, même rôle éditorial.
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
  }
  pdf.setTitle(`Facture ${input.number} — ${input.client.name}`)
  pdf.setAuthor(input.issuer.name)
  pdf.setSubject(`Facture ${input.number}`)

  const sheet = new Sheet(pdf, fonts)
  drawHeader(sheet, fonts, input)
  drawClient(sheet, fonts, input)
  drawLines(sheet, fonts, input)

  // Totaux et mentions ne se coupent pas en deux : s'ils ne tiennent plus, ils
  // passent entiers sur une page neuve.
  if (sheet.y + 60 > CONTENT_BOTTOM) {
    sheet.nextPage()
    sheet.y = 30
  }
  drawTotals(sheet, fonts, input)
  drawMentions(sheet, fonts, input)
  drawFooter(sheet, fonts, input)

  // Rappel du numéro sur les pages de suite : une facture qui se feuillette
  // doit s'identifier partout, pas seulement sur sa première page. La
  // pagination n'est connue qu'une fois le document terminé.
  const pages = pdf.getPages()
  if (pages.length > 1) {
    for (const [index, page] of pages.entries()) {
      if (index === 0) continue
      const text = safeText(fonts.regular, `Facture n°${input.number} · page ${index + 1}/${pages.length}`)
      const width = fonts.regular.widthOfTextAtSize(text, 8)
      page.drawText(text, {
        x: RIGHT_X * MM - width,
        y: (PAGE_H - 14) * MM,
        size: 8,
        font: fonts.regular,
        color: LABEL,
      })
    }
  }

  return pdf.save()
}

/** Nom de fichier proposé au téléchargement : « facture-2606-16-sames-driver.pdf ». */
export function invoiceFileName(number: string, clientName: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  return `facture-${slug(number)}-${slug(clientName)}.pdf`.replace(/-+\.pdf$/, '.pdf')
}
