import { describe, expect, it } from 'vitest'
import {
  CARD_H,
  CARD_W,
  GOOGLE_LOGO_BOX,
  LOGO_OFFSET_MAX,
  NFC_ICON_BOX,
  QR_BOX,
  contrastRatio,
  defaultCardName,
  fitInBox,
  formatCardPhone,
  logoBox,
  nfcCardDesignSchema,
  nfcCardProposalMessage,
  nfcCardProposalUrl,
  nfcCardTargetUrl,
  qrContrastWarning,
  qrMatrix,
  qrModuleRects,
  squareInBox,
  fitSourceInBox,
  NFC_ICON_SOURCE,
  NFC_ICON_PATHS,
} from './nfc-card'

describe('layout fixe', () => {
  it('les éléments fixes tiennent dans la carte et ne se chevauchent pas', () => {
    for (const box of [NFC_ICON_BOX, QR_BOX, GOOGLE_LOGO_BOX]) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.w).toBeLessThanOrEqual(CARD_W)
      expect(box.y + box.h).toBeLessThanOrEqual(CARD_H)
    }
    // Le logo Google est sous le QR, jamais dessus.
    expect(GOOGLE_LOGO_BOX.y).toBeGreaterThan(QR_BOX.y + QR_BOX.h)
    // Le QR est parfaitement centré sur la carte, en x comme en y.
    expect(QR_BOX.x + QR_BOX.w / 2).toBeCloseTo(CARD_W / 2)
    expect(QR_BOX.y + QR_BOX.h / 2).toBeCloseTo(CARD_H / 2)
  })

  it('logoBox : échelle et décalage autour du centre de base', () => {
    const base = logoBox({ logoScale: 1, logoOffsetX: 0, logoOffsetY: 0 })
    expect(base.x + base.w / 2).toBeCloseTo(27)
    const moved = logoBox({ logoScale: 0.5, logoOffsetX: 3, logoOffsetY: -2 })
    expect(moved.w).toBeCloseTo(base.w / 2)
    expect(moved.x + moved.w / 2).toBeCloseTo(30)
    expect(moved.y + moved.h / 2).toBeCloseTo(base.y + base.h / 2 - 2)
  })

  it('fitInBox : contient l’image en la centrant', () => {
    const box = { x: 10, y: 10, w: 40, h: 20 }
    const wide = fitInBox(box, 200, 50)
    expect(wide.w).toBe(40)
    expect(wide.h).toBe(10)
    expect(wide.y).toBe(15)
    const tall = fitInBox(box, 50, 200)
    expect(tall.h).toBe(20)
    expect(tall.x).toBeCloseTo(27.5)
    expect(fitInBox(box, 0, 0)).toEqual(box)
  })

  it('fitSourceInBox : l’icône NFC entre dans sa boîte, centrée, sans déformation', () => {
    const p = fitSourceInBox(NFC_ICON_BOX, NFC_ICON_SOURCE)
    const w = NFC_ICON_SOURCE.w * p.scale
    const h = NFC_ICON_SOURCE.h * p.scale
    expect(Math.max(w, h)).toBeLessThanOrEqual(Math.min(NFC_ICON_BOX.w, NFC_ICON_BOX.h) + 1e-9)
    expect(p.x + w / 2).toBeCloseTo(NFC_ICON_BOX.x + NFC_ICON_BOX.w / 2)
    expect(p.y + h / 2).toBeCloseTo(NFC_ICON_BOX.y + NFC_ICON_BOX.h / 2)
    // Tracé MyFrank : 7 formes pleines, toutes en coordonnées absolues.
    expect(NFC_ICON_PATHS).toHaveLength(7)
    for (const d of NFC_ICON_PATHS) expect(d.startsWith('M ')).toBe(true)
  })

  it('squareInBox : échelle uniforme, centrée', () => {
    const p = squareInBox({ x: 17, y: 57, w: 20, h: 21 }, 100)
    expect(p.scale).toBe(0.2)
    expect(p.x).toBe(17)
    expect(p.y).toBeCloseTo(57.5)
  })
})

describe('QR', () => {
  it('la matrice est carrée et contient les motifs de repérage', () => {
    const m = qrMatrix('https://ridewiz.fr/avis/guy')
    expect(m.size).toBeGreaterThanOrEqual(21)
    expect(m.dark).toHaveLength(m.size)
    // Coin haut-gauche du motif de repérage : toujours sombre.
    expect(m.dark[0]![0]).toBe(true)
    expect(m.dark[6]![6]).toBe(true)
    // Case blanche à l'intérieur du motif.
    expect(m.dark[1]![1]).toBe(false)
  })

  it('qrModuleRects reste dans la boîte avec une zone de silence', () => {
    const m = qrMatrix('https://ridewiz.fr/carte/guy')
    const rects = qrModuleRects(m, QR_BOX)
    expect(rects.length).toBeGreaterThan(0)
    // Les modules (coins de repérage inclus) sont symétriques autour du
    // centre de la carte : le QR imprimé est centré au dixième de mm près.
    const minX = Math.min(...rects.map((r) => r.x))
    const maxX = Math.max(...rects.map((r) => r.x + r.w))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    expect((minX + maxX) / 2).toBeCloseTo(CARD_W / 2, 1)
    expect((minY + maxY) / 2).toBeCloseTo(CARD_H / 2, 1)
    for (const r of rects) {
      expect(r.x).toBeGreaterThan(QR_BOX.x)
      expect(r.y).toBeGreaterThan(QR_BOX.y)
      expect(r.x + r.w).toBeLessThan(QR_BOX.x + QR_BOX.w + 1e-9)
      expect(r.y + r.h).toBeLessThan(QR_BOX.y + QR_BOX.h + 1e-9)
    }
  })

  it('le même texte donne exactement la même matrice (aperçu = impression)', () => {
    expect(qrMatrix('abc')).toEqual(qrMatrix('abc'))
  })
})

describe('nfcCardTargetUrl', () => {
  it('avis → tunnel Ridewiz, visite → carte digitale, slug encodé', () => {
    expect(nfcCardTargetUrl('https://ridewiz.fr/', 'guy', 'review')).toBe('https://ridewiz.fr/avis/guy')
    expect(nfcCardTargetUrl('https://ridewiz.fr', 'guy', 'business')).toBe('https://ridewiz.fr/carte/guy')
    expect(nfcCardTargetUrl('https://ridewiz.fr', 'a b', 'review')).toBe('https://ridewiz.fr/avis/a%20b')
  })
})

describe('textes', () => {
  it('defaultCardName : premier mot du nom d’affichage', () => {
    expect(defaultCardName('Guy Kerkar')).toBe('Guy')
    expect(defaultCardName('  Kerkar  Drive ')).toBe('Kerkar')
    expect(defaultCardName(null)).toBe('')
  })

  it('formatCardPhone : groupes de deux pour un numéro français', () => {
    expect(formatCardPhone('0745205565')).toBe('07.45.20.55.65')
    expect(formatCardPhone('07 45 20 55 65')).toBe('07.45.20.55.65')
    expect(formatCardPhone('+33 7 45 20 55 65')).toBe('07.45.20.55.65')
    expect(formatCardPhone('+41 79 123 45 67')).toBe('+41 79 123 45 67')
    expect(formatCardPhone('')).toBe('')
  })
})

describe('nfcCardDesignSchema', () => {
  const valid = {
    bgColor: '#f6f1e9',
    fgColor: '#111111',
    logoScale: '1.2',
    logoOffsetX: 3,
    logoOffsetY: -2,
    googleLogoStyle: 'mono',
    name: '  Guy ',
    title: 'Chauffeur   Privé',
    phone: '07.45.20.55.65',
    qtyReview: '10',
    qtyBusiness: 0,
  }

  it('normalise couleurs, nombres et espaces', () => {
    const r = nfcCardDesignSchema.parse(valid)
    expect(r.bgColor).toBe('#F6F1E9')
    expect(r.logoScale).toBe(1.2)
    expect(r.name).toBe('Guy')
    expect(r.title).toBe('Chauffeur Privé')
    expect(r.qtyReview).toBe(10)
  })

  it('refuse une couleur invalide, un décalage hors carte, une quantité négative', () => {
    expect(nfcCardDesignSchema.safeParse({ ...valid, bgColor: 'red' }).success).toBe(false)
    expect(nfcCardDesignSchema.safeParse({ ...valid, logoOffsetX: LOGO_OFFSET_MAX + 1 }).success).toBe(false)
    expect(nfcCardDesignSchema.safeParse({ ...valid, qtyReview: -1 }).success).toBe(false)
    expect(nfcCardDesignSchema.safeParse({ ...valid, googleLogoStyle: 'neon' }).success).toBe(false)
  })
})

describe('contraste', () => {
  it('noir sur blanc = 21, identique = 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1)
  })

  it('prévient sur contraste faible ou QR inversé, rien sur crème/noir', () => {
    expect(qrContrastWarning('#F6F1E9', '#111111')).toBeNull()
    expect(qrContrastWarning('#F6F1E9', '#E9DCC5')).toMatch(/Contraste/)
    expect(qrContrastWarning('#0E1B2C', '#E0B579')).toMatch(/fond sombre/)
  })
})

describe('proposition au chauffeur', () => {
  it('nfcCardProposalUrl : lien court, jeton encodé', () => {
    expect(nfcCardProposalUrl('https://ridewiz.fr/', 'abc123')).toBe('https://ridewiz.fr/cartes-nfc/abc123')
    expect(nfcCardProposalUrl('https://ridewiz.fr', 'a/b')).toBe('https://ridewiz.fr/cartes-nfc/a%2Fb')
  })

  it('nfcCardProposalMessage : prénom, quantités et lien', () => {
    const msg = nfcCardProposalMessage({
      driverName: 'Job Kerkar',
      url: 'https://ridewiz.fr/cartes-nfc/abc',
      qtyReview: 10,
      qtyBusiness: 10,
    })
    expect(msg).toContain('Salut Job,')
    expect(msg).toContain('10 cartes avis Google et 10 cartes de visite')
    expect(msg).toContain('https://ridewiz.fr/cartes-nfc/abc')
  })

  it('n’annonce que les produits réellement commandés', () => {
    const msg = nfcCardProposalMessage({ driverName: 'Guy', url: 'u', qtyReview: 0, qtyBusiness: 10 })
    expect(msg).toContain('(10 cartes de visite)')
    expect(msg).not.toContain('avis Google')
  })

  it('reste correct sans nom ni quantité', () => {
    const msg = nfcCardProposalMessage({ driverName: '', url: 'u', qtyReview: 0, qtyBusiness: 0 })
    expect(msg.startsWith('Salut, voici la proposition')).toBe(true)
  })
})
