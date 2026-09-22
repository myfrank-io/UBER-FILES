// Le fichier d'impression part à la production : ce qu'il contient — et surtout
// ce qu'il ne contient pas — se vérifie ici plutôt qu'à l'œil sur un PDF.
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { BLEED, CARD_H, CARD_W } from '~/lib/nfc-card'
import {
  generateNfcCardPreviewPdf,
  generateNfcCardPrintPdf,
  type NfcCardRenderInput,
} from '~/server/utils/nfc-card-pdf'

const MM_PER_PT = 25.4 / 72

function input(reviewUrl: string): NfcCardRenderInput {
  return {
    bgColor: '#F6F1E9',
    fgColor: '#111111',
    logo: null,
    logoScale: 1,
    logoOffsetX: 0,
    logoOffsetY: 0,
    googleLogoStyle: 'color',
    name: 'Paul Durand',
    title: 'Chauffeur VTC',
    phone: '07 88 76 47 19',
    urls: { review: reviewUrl, business: 'https://ridewiz.fr/paul' },
    driverName: 'Paul Durand',
  }
}

/**
 * Le dessin du PDF, flux de contenu décompressés et concaténés. On compare des
 * dessins plutôt que des fichiers : deux PDF produits à deux instants diffèrent
 * par leur date de création, pas par ce qu'ils tracent.
 */
function drawing(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes)
  const text = buf.toString('latin1')
  const out: string[] = []
  const opening = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = opening.exec(text))) {
    const end = text.indexOf('endstream', m.index)
    if (end < 0) continue
    const raw = buf.subarray(m.index + m[0].length, end)
    try {
      out.push(inflateSync(raw).toString('latin1'))
    } catch {
      out.push(raw.toString('latin1'))
    }
  }
  return out.join('\n')
}

// Deux URL de longueurs franchement différentes : un QR encodant l'une ou
// l'autre n'aurait ni le même nombre de modules ni le même dessin.
const URL_COURTE = 'https://ridewiz.fr/avis/alpha'
const URL_LONGUE = 'https://ridewiz.fr/avis/un-slug-nettement-plus-long-pour-changer-le-qr'

describe('generateNfcCardPrintPdf', () => {
  it('sort une page recto et une page verso, à la taille carte + fond perdu', async () => {
    const pdf = await PDFDocument.load(await generateNfcCardPrintPdf(input(URL_COURTE), 'review'))
    const pages = pdf.getPages()
    expect(pages).toHaveLength(2)
    for (const page of pages) {
      expect(page.getWidth() * MM_PER_PT).toBeCloseTo(CARD_W + 2 * BLEED, 3)
      expect(page.getHeight() * MM_PER_PT).toBeCloseTo(CARD_H + 2 * BLEED, 3)
    }
  })

  it("n'imprime aucun QR : deux URL différentes donnent le même dessin", async () => {
    const courte = drawing(await generateNfcCardPrintPdf(input(URL_COURTE), 'review'))
    const longue = drawing(await generateNfcCardPrintPdf(input(URL_LONGUE), 'review'))
    expect(courte).toBe(longue)
  })

  it("n'imprime aucun QR non plus au verso de la carte de visite", async () => {
    const courte = drawing(await generateNfcCardPrintPdf(input(URL_COURTE), 'business'))
    const longue = drawing(await generateNfcCardPrintPdf(input(URL_LONGUE), 'business'))
    expect(courte).toBe(longue)
  })
})

describe('generateNfcCardPreviewPdf', () => {
  // Garde-fou du test ci-dessus : si le QR disparaissait AUSSI de l'aperçu, ou
  // si `drawing()` cessait de voir les différences, « même dessin » ne voudrait
  // plus rien dire. L'aperçu, lui, doit bel et bien porter le QR.
  it('garde le QR : deux URL différentes donnent des dessins différents', async () => {
    const courte = drawing(await generateNfcCardPreviewPdf(input(URL_COURTE), ['review']))
    const longue = drawing(await generateNfcCardPreviewPdf(input(URL_LONGUE), ['review']))
    expect(courte).not.toBe(longue)
  })
})
