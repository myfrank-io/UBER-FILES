import { describe, expect, it } from 'vitest'
import {
  DUE_LABEL_SUGGESTIONS,
  INVOICE_PRESETS,
  LATE_PAYMENT_MENTION,
  defaultInstallments,
  evenShares,
  formatEuros,
  formatShare,
  formatSiret,
  invoiceNumberSortKey,
  invoiceTotals,
  isValidSiren,
  isValidSiret,
  lineAmountCents,
  nextInvoiceNumber,
  normalizeSiret,
  paymentTermsSentence,
  splitInstallments,
  vatMention,
} from './invoice'

describe('lineAmountCents', () => {
  it('multiplie la quantité par le prix unitaire', () => {
    expect(lineAmountCents({ quantity: 1, unitPriceCents: 40_000 })).toBe(40_000)
    expect(lineAmountCents({ quantity: 3, unitPriceCents: 20_000 })).toBe(60_000)
  })
  it('gère une quantité nulle', () => {
    expect(lineAmountCents({ quantity: 0, unitPriceCents: 40_000 })).toBe(0)
  })
})

describe('invoiceTotals', () => {
  it('additionne les lignes de la facture 2606-16 (400 + 200 = 600 €)', () => {
    const { subtotalCents, vatCents, totalCents } = invoiceTotals([
      { label: 'Accès Ridewiz', quantity: 1, unitPriceCents: 40_000 },
      { label: 'Création 20 cartes', quantity: 1, unitPriceCents: 20_000 },
    ])
    expect(subtotalCents).toBe(60_000)
    expect(vatCents).toBe(0)
    expect(totalCents).toBe(60_000)
  })
  it('en franchise en base, le total est le sous-total', () => {
    expect(invoiceTotals([{ label: 'x', quantity: 1, unitPriceCents: 40_000 }]).totalCents).toBe(40_000)
  })
  it('applique la TVA si un taux est fourni', () => {
    const totals = invoiceTotals([{ label: 'x', quantity: 1, unitPriceCents: 10_000 }], 2000)
    expect(totals.vatCents).toBe(2_000)
    expect(totals.totalCents).toBe(12_000)
  })
  it('renvoie zéro sans ligne', () => {
    expect(invoiceTotals([]).totalCents).toBe(0)
  })
})

describe('splitInstallments', () => {
  it('reproduit l’acompte 50 / 50 de la facture 2606-15 (200 € + 200 €)', () => {
    const parts = splitInstallments(40_000, [
      { shareBasisPoints: 5000, dueLabel: 'à la commande' },
      { shareBasisPoints: 5000, dueLabel: 'à la livraison' },
    ])
    expect(parts.map((p) => p.amountCents)).toEqual([20_000, 20_000])
  })
  it('la somme des échéances est TOUJOURS le total, même en trois fois', () => {
    const parts = splitInstallments(40_001, defaultInstallments(3))
    expect(parts.reduce((sum, p) => sum + p.amountCents, 0)).toBe(40_001)
  })
  it('met le reliquat d’arrondi sur la dernière échéance', () => {
    const parts = splitInstallments(10_000, [
      { shareBasisPoints: 3333, dueLabel: 'a' },
      { shareBasisPoints: 3333, dueLabel: 'b' },
      { shareBasisPoints: 3334, dueLabel: 'c' },
    ])
    expect(parts.reduce((sum, p) => sum + p.amountCents, 0)).toBe(10_000)
  })
  it('renvoie une liste vide sans échéance', () => {
    expect(splitInstallments(40_000, [])).toEqual([])
  })
})

describe('evenShares', () => {
  it('deux fois = 50 / 50', () => expect(evenShares(2)).toEqual([5000, 5000]))
  it('quatre fois = 25 chacun', () => expect(evenShares(4)).toEqual([2500, 2500, 2500, 2500]))
  it('trois fois : le reliquat va sur la première (34 / 33 / 33)', () => {
    expect(evenShares(3)).toEqual([3334, 3333, 3333])
    expect(evenShares(3).reduce((a, b) => a + b, 0)).toBe(10_000)
  })
  it('une seule fois = 100 %', () => expect(evenShares(1)).toEqual([10_000]))
})

describe('formatEuros', () => {
  it('masque les centimes quand ils sont nuls', () => expect(formatEuros(40_000)).toBe('400 €'))
  it('affiche les centimes sinon', () => expect(formatEuros(40_050)).toBe('400,50 €'))
  it('groupe les milliers avec une espace', () => expect(formatEuros(123_456)).toBe('1 234,56 €'))
  it('gère zéro', () => expect(formatEuros(0)).toBe('0 €'))
  // Le PDF est rendu avec les polices standard (WinAnsi) : une espace fine
  // insécable y sortirait en « ? ». Le séparateur de milliers reste une
  // espace ordinaire.
  it('n’utilise que des caractères imprimables par le PDF', () => {
    expect(formatEuros(1_234_567)).toMatch(/^[\d ]+,\d{2} €$/)
    expect(formatEuros(1_234_567)).not.toContain('\u202f')
  })
  it('gère un montant négatif (avoir)', () => expect(formatEuros(-20_000)).toBe('-200 €'))
})

describe('formatShare', () => {
  it('affiche un pourcentage rond sans décimale', () => expect(formatShare(5000)).toBe('50 %'))
  it('utilise la virgule décimale', () => expect(formatShare(3333)).toBe('33,33 %'))
})

describe('nextInvoiceNumber', () => {
  it('incrémente la série existante du client (2606-16 → 2606-17)', () => {
    expect(nextInvoiceNumber('2606-16')).toBe('2606-17')
  })
  it('conserve la longueur du compteur (FA-2026-009 → FA-2026-010)', () => {
    expect(nextInvoiceNumber('FA-2026-009')).toBe('FA-2026-010')
  })
  it('passe la dizaine sans perdre le préfixe', () => {
    expect(nextInvoiceNumber('2606-9')).toBe('2606-10')
  })
  it('démarre une série sur l’année et le mois sans numéro précédent', () => {
    expect(nextInvoiceNumber(null, new Date('2026-09-07T10:00:00Z'))).toBe('2609-01')
  })
  it('accepte un numéro sans chiffre', () => {
    expect(nextInvoiceNumber('FACTURE')).toBe('FACTURE-2')
  })
})

describe('invoiceNumberSortKey', () => {
  it('classe 2606-9 avant 2606-16', () => {
    expect(invoiceNumberSortKey('2606-9')).toBeLessThan(invoiceNumberSortKey('2606-16'))
  })
})

describe('SIRET / SIREN', () => {
  it('valide le SIRET de la facture 2606-15', () => expect(isValidSiret('90237881900012')).toBe(true))
  it('valide le SIRET de la facture 2606-16', () => expect(isValidSiret('93054682500017')).toBe(true))
  it('valide le SIRET de l’émetteur', () => expect(isValidSiret('92065972900015')).toBe(true))
  it('rejette un SIRET dont la clé de Luhn est fausse', () => {
    expect(isValidSiret('90237881900013')).toBe(false)
  })
  it('rejette une longueur incorrecte', () => {
    expect(isValidSiret('9023788190001')).toBe(false)
    expect(isValidSiren('90237881')).toBe(false)
  })
  it('valide le SIREN correspondant', () => expect(isValidSiren('902378819')).toBe(true))
  it('accepte La Poste, seule exception connue à la clé de Luhn', () => {
    expect(isValidSiren('356000000')).toBe(true)
  })
  it('tolère les espaces au collage', () => {
    expect(normalizeSiret('902 378 819 00012')).toBe('90237881900012')
    expect(isValidSiret('902 378 819 00012')).toBe(true)
  })
  it('met en forme un SIRET pour la lecture', () => {
    expect(formatSiret('90237881900012')).toBe('902 378 819 00012')
  })
})

describe('paymentTermsSentence', () => {
  it('reproduit la phrase d’acompte de la facture 2606-15', () => {
    const parts = splitInstallments(40_000, [
      { shareBasisPoints: 5000, dueLabel: 'à la commande' },
      { shareBasisPoints: 5000, dueLabel: 'à la livraison' },
    ])
    expect(paymentTermsSentence(parts)).toBe(
      'Modalités de paiement : acompte de 50 % à la commande, soit 200 €, à régler à réception de la ' +
        'présente facture. Le solde de 50 %, soit 200 €, sera dû à la livraison.',
    )
  })
  it('écrit un règlement comptant en une seule échéance', () => {
    const parts = splitInstallments(60_000, defaultInstallments(1))
    expect(paymentTermsSentence(parts)).toBe(
      'Modalités de paiement : règlement de la totalité, soit 600 €, à réception de la présente facture.',
    )
  })
  it('énumère au-delà de deux échéances', () => {
    const parts = splitInstallments(60_000, [
      { shareBasisPoints: 4000, dueLabel: 'à la commande' },
      { shareBasisPoints: 3000, dueLabel: 'à la livraison' },
      { shareBasisPoints: 3000, dueLabel: 'sous 30 jours' },
    ])
    expect(paymentTermsSentence(parts)).toBe(
      'Modalités de paiement : règlement en 3 fois — 40 % (240 €) à la commande, ' +
        '30 % (180 €) à la livraison, 30 % (180 €) sous 30 jours.',
    )
  })
  it('ne produit rien sans échéance', () => expect(paymentTermsSentence([])).toBe(''))
})

describe('mentions légales', () => {
  it('cite l’article 293 B du CGI en franchise en base', () => {
    expect(vatMention(0)).toBe('TVA non applicable, article 293 B du CGI')
  })
  it('affiche le taux quand la TVA s’applique', () => expect(vatMention(2000)).toBe('TVA 20 %'))
  it('cite les articles L441-10 et D441-5 pour les pénalités de retard', () => {
    expect(LATE_PAYMENT_MENTION).toContain('L441-10')
    expect(LATE_PAYMENT_MENTION).toContain('D441-5')
    expect(LATE_PAYMENT_MENTION).toContain('40 €')
  })
})

describe('préréglages', () => {
  it('propose l’accès à 400 € et les cartes à 200 €', () => {
    expect(INVOICE_PRESETS.find((p) => p.key === 'acces')?.unitPriceCents).toBe(40_000)
    expect(INVOICE_PRESETS.find((p) => p.key === 'cartes')?.unitPriceCents).toBe(20_000)
  })
  it('a des clés uniques', () => {
    expect(new Set(INVOICE_PRESETS.map((p) => p.key)).size).toBe(INVOICE_PRESETS.length)
  })
  // Deux boutons portant le même texte sont impossibles à distinguer : les
  // libellés de pastille doivent différer, même quand la désignation imprimée
  // commence pareil (« Accès Ridewiz »).
  it('a des libellés de pastille distincts', () => {
    expect(new Set(INVOICE_PRESETS.map((p) => p.chip)).size).toBe(INVOICE_PRESETS.length)
  })
  it('propose des échéances courantes', () => {
    expect(DUE_LABEL_SUGGESTIONS).toContain('à la commande')
    expect(DUE_LABEL_SUGGESTIONS).toContain('à la livraison')
  })
})

describe('defaultInstallments', () => {
  it('en deux fois : acompte à la commande, solde à la livraison', () => {
    expect(defaultInstallments(2)).toEqual([
      { shareBasisPoints: 5000, dueLabel: 'à la commande' },
      { shareBasisPoints: 5000, dueLabel: 'à la livraison' },
    ])
  })
  it('en une fois : à réception', () => {
    expect(defaultInstallments(1)[0]?.dueLabel).toBe('à réception de la présente facture')
  })
})
