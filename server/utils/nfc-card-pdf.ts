// PDF des cartes NFC physiques (pdf-lib, pur JavaScript : aucun navigateur
// headless sur Vercel). Deux sorties :
//   - le fichier d'IMPRESSION d'un produit : une page recto, une page verso, au
//     format carte + fond perdu (BLEED sur chaque bord), bords droits, vrai QR ;
//   - la PRÉVISUALISATION : une page A4 par produit, recto et verso côte à côte
//     avec coins arrondis, telle que la carte est affichée dans l'admin.
//
// Toutes les positions viennent de lib/nfc-card.ts (mm), partagées avec
// l'aperçu SVG : une seule table, jamais deux implémentations qui divergent.
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib'
import {
  BLEED,
  BUSINESS_NAME_LINE,
  BUSINESS_PHONE_LINE,
  BUSINESS_TITLE_LINE,
  CARD_H,
  CARD_RADIUS,
  CARD_W,
  FRONT_TEXT,
  FRONT_TEXT_VALUES,
  GOOGLE_G_PATHS,
  GOOGLE_G_VIEWBOX,
  GOOGLE_LOGO_BOX,
  NFC_CARD_PRODUCT_LABELS,
  NFC_ICON_BOX,
  NFC_ICON_PATHS,
  NFC_ICON_SOURCE,
  QR_BOX,
  REVIEW_BACK_TEXT,
  REVIEW_BACK_TEXT_VALUES,
  fitInBox,
  fitSourceInBox,
  lineText,
  logoBox,
  qrMatrix,
  qrModuleRects,
  squareInBox,
  type GoogleLogoStyle,
  type NfcCardProduct,
  type QrMatrix,
  type TextLine,
} from '~/lib/nfc-card'

const MM = 72 / 25.4

/** Tout ce que le rendu d'une carte a besoin de savoir — déjà résolu (pas de Prisma ici). */
export interface NfcCardRenderInput {
  bgColor: string
  fgColor: string
  logo: { bytes: Uint8Array; mime: string } | null
  logoScale: number
  logoOffsetX: number
  logoOffsetY: number
  googleLogoStyle: GoogleLogoStyle
  name: string
  title: string
  phone: string
  /** URL encodée dans le QR de chaque produit. */
  urls: Record<NfcCardProduct, string>
  /** Nom du chauffeur, pour l'en-tête de la prévisualisation. */
  driverName: string
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/**
 * Texte encodable par les polices standard (WinAnsi) : un caractère hors
 * table (emoji, alphabet non latin…) ferait échouer tout le PDF ; on le
 * remplace par « ? » plutôt que de planter l'envoi.
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

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  /** Sans-serif, réservée aux libellés de mise en page (jamais sur la carte). */
  sans: PDFFont
  sansBold: PDFFont
}

/**
 * Contexte de dessin d'une carte : origine (mm) du coin haut-gauche de la
 * carte sur la page, facteur d'échelle (1 = taille réelle) et hauteur de page
 * pour retourner l'axe y (PDF : origine en bas).
 */
class CardCanvas {
  constructor(
    private page: PDFPage,
    private ox: number,
    private oy: number,
    private s: number,
    private fonts: Fonts,
    private input: NfcCardRenderInput,
    private logoImage: PDFImage | null,
  ) {}

  private x(mm: number) {
    return (this.ox + mm * this.s) * MM
  }

  private y(mm: number) {
    return (this.page.getHeight() / MM - this.oy - mm * this.s) * MM
  }

  private len(mm: number) {
    return mm * this.s * MM
  }

  private get fg() {
    return hexToRgb(this.input.fgColor)
  }

  /** Fond de la carte : rectangle plein (impression) ou coins arrondis (aperçu). */
  background(rounded: boolean, extra = 0) {
    const bg = hexToRgb(this.input.bgColor)
    if (!rounded) {
      this.page.drawRectangle({
        x: this.x(-extra),
        y: this.y(CARD_H + extra),
        width: this.len(CARD_W + 2 * extra),
        height: this.len(CARD_H + 2 * extra),
        color: bg,
      })
      return
    }
    const r = CARD_RADIUS
    const w = CARD_W
    const h = CARD_H
    const d = `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`
    this.page.drawSvgPath(d, { x: this.x(0), y: this.y(0), scale: this.s * MM, color: bg })
  }

  /** Ligne de texte centrée horizontalement, ligne de base à `line.y`. */
  text(line: TextLine, value: string) {
    const font = line.bold ? this.fonts.bold : this.fonts.regular
    const text = safeText(font, lineText(line, value))
    if (!text) return
    const size = this.len(line.size)
    const tracking = (line.tracking ?? 0) * size
    const chars = [...text]
    const natural = font.widthOfTextAtSize(text, size)
    const total = natural + tracking * Math.max(0, chars.length - 1)
    let cx = this.x(CARD_W / 2) - total / 2
    const y = this.y(line.y)
    if (!tracking) {
      this.page.drawText(text, { x: cx, y, size, font, color: this.fg })
      return
    }
    // Interlettrage : pdf-lib n'a pas d'option d'espacement, on pose chaque
    // glyphe à la main.
    for (const ch of chars) {
      this.page.drawText(ch, { x: cx, y, size, font, color: this.fg })
      cx += font.widthOfTextAtSize(ch, size) + tracking
    }
  }

  logo() {
    if (!this.logoImage) return
    const box = logoBox(this.input)
    const fit = fitInBox(box, this.logoImage.width, this.logoImage.height)
    this.page.drawImage(this.logoImage, {
      x: this.x(fit.x),
      y: this.y(fit.y + fit.h),
      width: this.len(fit.w),
      height: this.len(fit.h),
    })
  }

  nfcIcon() {
    const p = fitSourceInBox(NFC_ICON_BOX, NFC_ICON_SOURCE)
    const scale = p.scale * this.s * MM
    // Le tracé est en coordonnées absolues du dessin source : on décale
    // l'origine pour que (source.x, source.y) tombe sur le coin de la boîte
    // (l'axe y du tracé pointe vers le bas, celui du PDF vers le haut).
    for (const d of NFC_ICON_PATHS) {
      this.page.drawSvgPath(d, {
        x: this.x(p.x) - NFC_ICON_SOURCE.x * scale,
        y: this.y(p.y) + NFC_ICON_SOURCE.y * scale,
        scale,
        color: this.fg,
      })
    }
  }

  googleLogo() {
    const p = squareInBox(GOOGLE_LOGO_BOX, GOOGLE_G_VIEWBOX)
    const scale = p.scale * this.s * MM
    for (const path of GOOGLE_G_PATHS) {
      this.page.drawSvgPath(path.d, {
        x: this.x(p.x),
        y: this.y(p.y),
        scale,
        color: this.input.googleLogoStyle === 'color' ? hexToRgb(path.color) : this.fg,
      })
    }
  }

  qr(matrix: QrMatrix) {
    // Un léger recouvrement (0.02 mm) évite les filets clairs entre modules
    // adjacents à l'impression.
    for (const r of qrModuleRects(matrix, QR_BOX)) {
      this.page.drawRectangle({
        x: this.x(r.x),
        y: this.y(r.y + r.h + 0.02),
        width: this.len(r.w + 0.02),
        height: this.len(r.h + 0.02),
        color: this.fg,
      })
    }
  }

  front() {
    this.logo()
    FRONT_TEXT.forEach((line, i) => this.text(line, FRONT_TEXT_VALUES[i]!))
    this.nfcIcon()
  }

  back(product: NfcCardProduct, matrix: QrMatrix) {
    if (product === 'review') {
      REVIEW_BACK_TEXT.forEach((line, i) => this.text(line, REVIEW_BACK_TEXT_VALUES[i]!))
      this.qr(matrix)
      this.googleLogo()
      return
    }
    this.text(BUSINESS_NAME_LINE, this.input.name)
    this.text(BUSINESS_TITLE_LINE, this.input.title)
    this.qr(matrix)
    this.text(BUSINESS_PHONE_LINE, this.input.phone)
  }
}

async function prepare(input: NfcCardRenderInput) {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  let logoImage: PDFImage | null = null
  if (input.logo) {
    logoImage = /jpe?g/i.test(input.logo.mime)
      ? await pdf.embedJpg(input.logo.bytes)
      : await pdf.embedPng(input.logo.bytes)
  }
  return { pdf, fonts, logoImage }
}

/**
 * Fichier d'impression d'un produit : page 1 recto, page 2 verso, chacune au
 * format carte + fond perdu, fond plein jusqu'au bord, vrai QR code.
 */
export async function generateNfcCardPrintPdf(input: NfcCardRenderInput, product: NfcCardProduct): Promise<Uint8Array> {
  const { pdf, fonts, logoImage } = await prepare(input)
  pdf.setTitle(`Cartes ${NFC_CARD_PRODUCT_LABELS[product]} — ${input.driverName} (impression)`)
  const matrix = qrMatrix(input.urls[product])
  const pageW = (CARD_W + 2 * BLEED) * MM
  const pageH = (CARD_H + 2 * BLEED) * MM

  for (const side of ['front', 'back'] as const) {
    const page = pdf.addPage([pageW, pageH])
    const canvas = new CardCanvas(page, BLEED, BLEED, 1, fonts, input, logoImage)
    canvas.background(false, BLEED)
    if (side === 'front') canvas.front()
    else canvas.back(product, matrix)
  }
  return pdf.save()
}

/**
 * Prévisualisation : une page A4 par produit commandé, recto et verso côte à
 * côte (échelle 1,6), coins arrondis, avec le titre du produit et l'URL du QR.
 */
export async function generateNfcCardPreviewPdf(
  input: NfcCardRenderInput,
  products: NfcCardProduct[],
): Promise<Uint8Array> {
  const { pdf, fonts, logoImage } = await prepare(input)
  pdf.setTitle(`Cartes NFC — ${input.driverName} (prévisualisation)`)
  const A4: [number, number] = [210 * MM, 297 * MM]
  const scale = 1.6
  const cardW = CARD_W * scale
  const cardH = CARD_H * scale
  const gap = 14
  const left = (210 - (2 * cardW + gap)) / 2
  const top = 48
  const ink = rgb(0.09, 0.16, 0.26)
  const muted = rgb(0.55, 0.5, 0.42)

  for (const product of products) {
    const matrix = qrMatrix(input.urls[product])
    const page = pdf.addPage(A4)
    const title = safeText(fonts.bold, `${NFC_CARD_PRODUCT_LABELS[product]} — ${input.driverName}`)
    page.drawText(title, { x: left * MM, y: (297 - 24) * MM, size: 16, font: fonts.bold, color: ink })
    page.drawText(safeText(fonts.regular, `QR : ${input.urls[product]}`), {
      x: left * MM,
      y: (297 - 32) * MM,
      size: 9,
      font: fonts.regular,
      color: muted,
    })

    const sides: { side: 'front' | 'back'; label: string; ox: number }[] = [
      { side: 'front', label: 'RECTO', ox: left },
      { side: 'back', label: 'VERSO', ox: left + cardW + gap },
    ]
    for (const s of sides) {
      page.drawText(s.label, { x: s.ox * MM, y: (297 - top + 4) * MM, size: 9, font: fonts.bold, color: muted })
      const canvas = new CardCanvas(page, s.ox, top, scale, fonts, input, logoImage)
      canvas.background(true)
      if (s.side === 'front') canvas.front()
      else canvas.back(product, matrix)
    }

    page.drawText(
      safeText(
        fonts.regular,
        `Format CR80 ${CARD_W} × ${CARD_H} mm, aperçu à l'échelle ${scale}. Fichier d'impression : recto/verso avec ${BLEED} mm de fond perdu.`,
      ),
      { x: left * MM, y: (297 - top - cardH - 10) * MM, size: 8, font: fonts.regular, color: muted },
    )
  }
  return pdf.save()
}

// ─── Proposition envoyée au chauffeur ────────────────────────────────────────

/** Ce que fait chaque carte, expliqué au chauffeur (sans jargon d'impression). */
const PROPOSAL_EXPLAINER: Record<NfcCardProduct, string> = {
  review:
    "Votre client approche son téléphone de la carte, ou scanne le QR code. Il arrive sur votre page d'avis : cinq étoiles l'envoient déposer son avis sur votre fiche Google, une note plus basse vous revient en privé sans passer en public.",
  business:
    'Votre client approche son téléphone de la carte, ou scanne le QR code. Votre carte de visite en ligne s\u2019ouvre : vos coordonnées, vos véhicules et le bouton pour réserver une course.',
}

/** Découpe un texte en lignes qui tiennent dans `maxWidth` (en points). */
function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of safeText(font, text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Texte interlettré (petites capitales de mise en page), aligné à gauche. */
function drawTracked(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: RGB; tracking: number },
) {
  let x = opts.x
  for (const ch of safeText(opts.font, text)) {
    page.drawText(ch, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color })
    x += opts.font.widthOfTextAtSize(ch, opts.size) + opts.tracking
  }
}

function trackedWidth(font: PDFFont, text: string, size: number, tracking: number): number {
  const chars = [...safeText(font, text)]
  return font.widthOfTextAtSize(chars.join(''), size) + tracking * Math.max(0, chars.length - 1)
}

/** Contour arrondi d'une carte, dans le repère du dessin (mm). */
function roundedCardPath(): string {
  const r = CARD_RADIUS
  const w = CARD_W
  const h = CARD_H
  return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`
}

/**
 * PDF de PROPOSITION, celui qu'on envoie au chauffeur : une page A4 par
 * produit, recto et verso en grand, ce que fait la carte et le lien ouvert par
 * le QR. Aucune mention de fond perdu ni de fichier d'impression — c'est la
 * prévisualisation qui parle à la production, pas celle-ci.
 */
export async function generateNfcCardProposalPdf(
  input: NfcCardRenderInput,
  products: { product: NfcCardProduct; quantity: number }[],
): Promise<Uint8Array> {
  const { pdf, fonts, logoImage } = await prepare(input)
  pdf.setTitle(`Proposition de cartes NFC — ${input.driverName}`)

  const A4: [number, number] = [210 * MM, 297 * MM]
  const ink = rgb(0.055, 0.106, 0.173)
  const muted = rgb(0.604, 0.545, 0.447)
  const copper = rgb(0.71, 0.475, 0.247)
  const hairline = rgb(0.87, 0.85, 0.82)

  const scale = 1.6
  const cardW = CARD_W * scale
  const cardH = CARD_H * scale
  const gap = 14
  const left = (210 - (2 * cardW + gap)) / 2
  const cardsTop = 74
  // y compté depuis le HAUT de la page, converti pour l'axe PDF (origine en bas).
  const Y = (mmFromTop: number) => (297 - mmFromTop) * MM

  for (const { product, quantity } of products) {
    const page = pdf.addPage(A4)
    const matrix = qrMatrix(input.urls[product])

    drawTracked(page, 'PROPOSITION DE DESIGN', {
      x: left * MM,
      y: Y(22),
      size: 8,
      font: fonts.sansBold,
      color: muted,
      tracking: 1.6,
    })
    page.drawText(safeText(fonts.bold, NFC_CARD_PRODUCT_LABELS[product]), {
      x: left * MM,
      y: Y(35),
      size: 22,
      font: fonts.bold,
      color: ink,
    })
    const subtitle = `${input.driverName} · ${quantity} carte${quantity > 1 ? 's' : ''}`
    page.drawText(safeText(fonts.sans, subtitle), {
      x: left * MM,
      y: Y(43),
      size: 10,
      font: fonts.sans,
      color: muted,
    })
    page.drawLine({
      start: { x: left * MM, y: Y(49) },
      end: { x: (left + 38) * MM, y: Y(49) },
      thickness: 1,
      color: copper,
    })

    // Recto / verso, en grand, avec un filet discret pour détacher les cartes
    // claires du papier.
    const sides: { side: 'front' | 'back'; label: string; ox: number }[] = [
      { side: 'front', label: 'RECTO', ox: left },
      { side: 'back', label: 'VERSO', ox: left + cardW + gap },
    ]
    for (const s of sides) {
      const canvas = new CardCanvas(page, s.ox, cardsTop, scale, fonts, input, logoImage)
      canvas.background(true)
      if (s.side === 'front') canvas.front()
      else canvas.back(product, matrix)
      page.drawSvgPath(roundedCardPath(), {
        x: s.ox * MM,
        y: Y(cardsTop),
        scale: scale * MM,
        borderColor: hairline,
        borderWidth: 0.6,
      })
      const w = trackedWidth(fonts.sansBold, s.label, 8, 1.6)
      drawTracked(page, s.label, {
        x: (s.ox + cardW / 2) * MM - w / 2,
        y: Y(cardsTop + cardH + 7),
        size: 8,
        font: fonts.sansBold,
        color: muted,
        tracking: 1.6,
      })
    }

    // Ce que fait la carte, puis le lien qu'ouvre le QR.
    const textTop = cardsTop + cardH + 22
    drawTracked(page, 'CE QUE FAIT LA CARTE', {
      x: left * MM,
      y: Y(textTop),
      size: 8,
      font: fonts.sansBold,
      color: muted,
      tracking: 1.6,
    })
    const width = (2 * cardW + gap) * MM
    wrapText(fonts.regular, PROPOSAL_EXPLAINER[product], 11, width).forEach((line, i) => {
      page.drawText(line, { x: left * MM, y: Y(textTop + 8 + i * 5.4), size: 11, font: fonts.regular, color: ink })
    })
    page.drawText(safeText(fonts.sans, `Le QR code ouvre : ${input.urls[product]}`), {
      x: left * MM,
      y: Y(textTop + 30),
      size: 9,
      font: fonts.sans,
      color: muted,
    })

    const footer = 'Ridewiz · Votre chauffeur, votre signature.'
    const fw = fonts.sans.widthOfTextAtSize(safeText(fonts.sans, footer), 8)
    page.drawText(safeText(fonts.sans, footer), {
      x: 105 * MM - fw / 2,
      y: Y(283),
      size: 8,
      font: fonts.sans,
      color: muted,
    })
  }
  return pdf.save()
}
