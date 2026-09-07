import { describe, expect, it } from 'vitest'
import {
  DUE_LABEL_SUGGESTIONS,
  cashPosition,
  invoiceSettlement,
  statusFromInstallments,
  LATE_PAYMENT_MENTION,
  defaultInstallments,
  formatEuros,
  formatShare,
  formatSiret,
  invoiceNumberSortKey,
  invoiceShareUrl,
  invoiceTotals,
  invoiceWhatsAppMessage,
  isValidSiren,
  isValidSiret,
  discountLabel,
  isLineFree,
  lineDiscountCents,
  lineGrossCents,
  lineNetCents,
  nextInvoiceNumber,
  normalizeSiret,
  paymentTermsSentence,
  shareBasisPoints,
  splitAmountsEvenly,
  vatMention,
} from './invoice'

describe('montant d’une ligne', () => {
  it('multiplie la quantité par le prix unitaire', () => {
    expect(lineGrossCents({ label: 'x', quantity: 1, unitPriceCents: 40_000 })).toBe(40_000)
    expect(lineGrossCents({ label: 'x', quantity: 3, unitPriceCents: 20_000 })).toBe(60_000)
  })
  it('gère une quantité nulle', () => {
    expect(lineGrossCents({ label: 'x', quantity: 0, unitPriceCents: 40_000 })).toBe(0)
  })
  it('sans remise, le net vaut le brut', () => {
    const line = { label: 'x', quantity: 1, unitPriceCents: 40_000 }
    expect(lineDiscountCents(line)).toBe(0)
    expect(lineNetCents(line)).toBe(40_000)
  })
})

describe('remise de ligne', () => {
  const base = { label: 'Logo', quantity: 1, unitPriceCents: 5_000 }

  it('applique un pourcentage', () => {
    const line = { ...base, discountKind: 'PERCENT' as const, discountValue: 2000 }
    expect(lineDiscountCents(line)).toBe(1_000)
    expect(lineNetCents(line)).toBe(4_000)
  })
  it('applique un montant fixe', () => {
    const line = { ...base, discountKind: 'AMOUNT' as const, discountValue: 1_500 }
    expect(lineDiscountCents(line)).toBe(1_500)
    expect(lineNetCents(line)).toBe(3_500)
  })
  it('« offert » = 100 %, la ligne tombe à zéro', () => {
    const line = { ...base, discountKind: 'PERCENT' as const, discountValue: 10_000 }
    expect(lineNetCents(line)).toBe(0)
    expect(isLineFree(line)).toBe(true)
  })
  // Une remise supérieure à la ligne créerait un avoir au milieu de la facture.
  it('ne dépasse jamais le montant de la ligne', () => {
    expect(lineNetCents({ ...base, discountKind: 'AMOUNT', discountValue: 999_999 })).toBe(0)
    expect(lineNetCents({ ...base, discountKind: 'PERCENT', discountValue: 99_999 })).toBe(0)
  })
  it('ignore une remise négative ou nulle', () => {
    expect(lineDiscountCents({ ...base, discountKind: 'PERCENT', discountValue: 0 })).toBe(0)
    expect(lineDiscountCents({ ...base, discountKind: 'AMOUNT', discountValue: -500 })).toBe(0)
  })
  it('ignore la valeur quand aucune remise n’est choisie', () => {
    expect(lineDiscountCents({ ...base, discountKind: 'NONE', discountValue: 5_000 })).toBe(0)
  })
  it('tient compte de la quantité', () => {
    const line = { label: 'x', quantity: 3, unitPriceCents: 10_000, discountKind: 'PERCENT' as const, discountValue: 1000 }
    expect(lineDiscountCents(line)).toBe(3_000)
  })
  it('une ligne à zéro n’est pas « offerte »', () => {
    expect(isLineFree({ label: 'x', quantity: 1, unitPriceCents: 0 })).toBe(false)
  })
})

describe('discountLabel', () => {
  it('annonce la valeur de ce qui est offert', () => {
    expect(discountLabel({ label: 'Logo', quantity: 1, unitPriceCents: 5_000, discountKind: 'PERCENT', discountValue: 10_000 }))
      .toBe('Offert — valeur 50 €')
  })
  it('annonce le pourcentage et le montant remisé', () => {
    expect(discountLabel({ label: 'Logo', quantity: 1, unitPriceCents: 5_000, discountKind: 'PERCENT', discountValue: 2000 }))
      .toBe('Remise 20 % — 10 €')
  })
  it('annonce un montant fixe', () => {
    expect(discountLabel({ label: 'Logo', quantity: 1, unitPriceCents: 5_000, discountKind: 'AMOUNT', discountValue: 1_500 }))
      .toBe('Remise — 15 €')
  })
  it('ne dit rien sans remise', () => {
    expect(discountLabel({ label: 'Logo', quantity: 1, unitPriceCents: 5_000 })).toBeNull()
  })
})

describe('invoiceTotals', () => {
  it('additionne les lignes de la facture 2606-16 (400 + 200 = 600 €)', () => {
    const totals = invoiceTotals([
      { label: 'Accès Ridewiz', quantity: 1, unitPriceCents: 40_000 },
      { label: 'Création 20 cartes', quantity: 1, unitPriceCents: 20_000 },
    ])
    expect(totals.grossCents).toBe(60_000)
    expect(totals.discountCents).toBe(0)
    expect(totals.subtotalCents).toBe(60_000)
    expect(totals.totalCents).toBe(60_000)
  })
  it('déduit les remises du total', () => {
    const totals = invoiceTotals([
      { label: 'Accès', quantity: 1, unitPriceCents: 40_000 },
      { label: 'Logo', quantity: 1, unitPriceCents: 5_000, discountKind: 'PERCENT', discountValue: 10_000 },
      { label: 'Cartes', quantity: 1, unitPriceCents: 20_000, discountKind: 'AMOUNT', discountValue: 2_000 },
    ])
    expect(totals.grossCents).toBe(65_000)
    expect(totals.discountCents).toBe(7_000)
    expect(totals.subtotalCents).toBe(58_000)
    expect(totals.totalCents).toBe(58_000)
  })
  it('en franchise en base, le total est le sous-total', () => {
    expect(invoiceTotals([{ label: 'x', quantity: 1, unitPriceCents: 40_000 }]).totalCents).toBe(40_000)
  })
  it('applique la TVA sur le montant remisé', () => {
    const totals = invoiceTotals(
      [{ label: 'x', quantity: 1, unitPriceCents: 10_000, discountKind: 'PERCENT', discountValue: 5000 }],
      2000,
    )
    expect(totals.subtotalCents).toBe(5_000)
    expect(totals.vatCents).toBe(1_000)
    expect(totals.totalCents).toBe(6_000)
  })
  it('renvoie zéro sans ligne', () => {
    expect(invoiceTotals([]).totalCents).toBe(0)
  })
})

describe('splitAmountsEvenly', () => {
  // Partir de pourcentages donnait 33,34 / 33,33 / 33,33 %, soit
  // 200,04 / 199,98 / 199,98 € sur 600 €. On part des montants : ils tombent ronds.
  it('600 € en 3 fois = 200 / 200 / 200', () => {
    expect(splitAmountsEvenly(60_000, 3)).toEqual([20_000, 20_000, 20_000])
  })
  it('reproduit l’acompte 50 / 50 de la facture 2606-15 (200 € + 200 €)', () => {
    expect(splitAmountsEvenly(40_000, 2)).toEqual([20_000, 20_000])
  })
  it('500 € en 3 fois = 167 / 167 / 166 : les euros en trop se répartissent', () => {
    expect(splitAmountsEvenly(50_000, 3)).toEqual([16_700, 16_700, 16_600])
  })
  it('400 € en 3 fois = 134 / 133 / 133', () => {
    expect(splitAmountsEvenly(40_000, 3)).toEqual([13_400, 13_300, 13_300])
  })
  it('chaque échéance est un nombre entier d’euros quand le total l’est', () => {
    for (const total of [40_000, 50_000, 60_000, 75_000, 99_900]) {
      for (const count of [2, 3, 4]) {
        for (const part of splitAmountsEvenly(total, count)) {
          expect(part % 100).toBe(0)
        }
      }
    }
  })
  it('les centimes du total atterrissent sur la première échéance', () => {
    expect(splitAmountsEvenly(40_050, 2)).toEqual([20_050, 20_000])
  })
  it('la somme vaut TOUJOURS exactement le total', () => {
    for (const total of [1, 99, 40_000, 40_001, 50_000, 123_457]) {
      for (const count of [1, 2, 3, 4, 5, 12]) {
        expect(splitAmountsEvenly(total, count).reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
  it('en une fois, l’échéance porte tout le total', () => {
    expect(splitAmountsEvenly(60_000, 1)).toEqual([60_000])
  })
  it('renvoie une liste vide pour zéro échéance', () => {
    expect(splitAmountsEvenly(60_000, 0)).toEqual([])
  })
})

describe('shareBasisPoints', () => {
  it('déduit la part d’un montant', () => {
    expect(shareBasisPoints(20_000, 40_000)).toBe(5000)
    expect(shareBasisPoints(20_000, 60_000)).toBe(3333)
  })
  it('ne divise pas par zéro', () => expect(shareBasisPoints(0, 0)).toBe(0))
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
    expect(formatEuros(1_234_567)).not.toContain(' ')
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
    expect(paymentTermsSentence(defaultInstallments(40_000, 2))).toBe(
      'Modalités de paiement : acompte de 50 % à la commande, soit 200 €, à régler à réception de la ' +
        'présente facture. Le solde de 50 %, soit 200 €, sera dû à la livraison.',
    )
  })
  it('écrit un règlement comptant en une seule échéance', () => {
    expect(paymentTermsSentence(defaultInstallments(60_000, 1))).toBe(
      'Modalités de paiement : règlement de la totalité, soit 600 €, à réception de la présente facture.',
    )
  })
  it('énumère des montants ronds au-delà de deux échéances', () => {
    expect(paymentTermsSentence(defaultInstallments(60_000, 3))).toBe(
      'Modalités de paiement : règlement en 3 fois — 200 € à la commande, 200 € échéance 2, ' +
        '200 € à la livraison.',
    )
  })
  // Un pourcentage qui ne tombe pas rond ne s'écrit pas : le client règle un
  // montant, pas une fraction.
  it('tait le pourcentage quand il ne tombe pas rond', () => {
    expect(
      paymentTermsSentence([
        { amountCents: 25_000, dueLabel: 'à la commande' },
        { amountCents: 35_000, dueLabel: 'à la livraison' },
      ]),
    ).toBe(
      'Modalités de paiement : acompte de 250 € à la commande, à régler à réception de la présente ' +
        'facture. Le solde, soit 350 €, sera dû à la livraison.',
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

describe('DUE_LABEL_SUGGESTIONS', () => {
  it('propose les échéances courantes', () => {
    expect(DUE_LABEL_SUGGESTIONS).toContain('à la commande')
    expect(DUE_LABEL_SUGGESTIONS).toContain('à la livraison')
  })
})

describe('defaultInstallments', () => {
  it('en deux fois : acompte à la commande, solde à la livraison', () => {
    expect(defaultInstallments(40_000, 2)).toEqual([
      { amountCents: 20_000, dueLabel: 'à la commande' },
      { amountCents: 20_000, dueLabel: 'à la livraison' },
    ])
  })
  it('en trois fois sur 600 € : trois échéances de 200 €', () => {
    expect(defaultInstallments(60_000, 3).map((p) => p.amountCents)).toEqual([20_000, 20_000, 20_000])
  })
  it('en une fois : à réception', () => {
    expect(defaultInstallments(60_000, 1)[0]?.dueLabel).toBe('à réception de la présente facture')
  })
})

describe('lien public et message WhatsApp', () => {
  it('construit un lien court', () => {
    expect(invoiceShareUrl('https://ridewiz.fr', 'abc123')).toBe('https://ridewiz.fr/facture/abc123')
  })
  it('ne double pas la barre oblique', () => {
    expect(invoiceShareUrl('https://ridewiz.fr/', 'abc123')).toBe('https://ridewiz.fr/facture/abc123')
  })

  // Les chauffeurs sont tutoyés dans tous les messages qu'on leur adresse.
  it('tutoie le chauffeur et l’appelle par son prénom', () => {
    const message = invoiceWhatsAppMessage({
      driverName: 'Miguel Fonsat',
      number: '2606-17',
      totalCents: 55_000,
      url: 'https://ridewiz.fr/facture/abc123',
      paymentTerms: 'Modalités de paiement : règlement à réception.',
    })
    expect(message).toContain('Salut Miguel')
    expect(message).toContain('ta facture n°2606-17 — 550 € :')
    expect(message).toContain('https://ridewiz.fr/facture/abc123')
    expect(message).toContain('Modalités de paiement : règlement à réception.')
    expect(message).toContain('si tu as une question')
    expect(message).not.toMatch(/\b(vous|votre|vos)\b/i)
  })
  it('se passe de prénom quand on n’en a pas', () => {
    const message = invoiceWhatsAppMessage({
      driverName: '',
      number: '2606-17',
      totalCents: 55_000,
      url: 'https://ridewiz.fr/facture/abc123',
      paymentTerms: null,
    })
    expect(message.startsWith('Salut 👋')).toBe(true)
  })
  it('omet les modalités quand il n’y en a pas', () => {
    const message = invoiceWhatsAppMessage({
      driverName: 'Miguel',
      number: '2606-17',
      totalCents: 55_000,
      url: 'https://ridewiz.fr/facture/abc123',
      paymentTerms: null,
    })
    expect(message).not.toContain('Modalités')
  })
})

describe('règlement d’une facture', () => {
  const part = (amountCents: number, paid = false) => ({ amountCents, paidAt: paid ? new Date() : null })

  it('compte ce qui est encaissé et ce qui reste, échéance par échéance', () => {
    const s = invoiceSettlement({
      status: 'SENT',
      totalCents: 60_000,
      installments: [part(20_000, true), part(20_000), part(20_000)],
    })
    expect(s.collectedCents).toBe(20_000)
    expect(s.outstandingCents).toBe(40_000)
    expect(s.billedCents).toBe(60_000)
    expect(s.paidCount).toBe(1)
    expect(s.partCount).toBe(3)
    expect(s.fullyPaid).toBe(false)
  })

  it('solde la facture quand toutes les échéances sont cochées', () => {
    const s = invoiceSettlement({
      status: 'SENT',
      totalCents: 40_000,
      installments: [part(20_000, true), part(20_000, true)],
    })
    expect(s.collectedCents).toBe(40_000)
    expect(s.outstandingCents).toBe(0)
    expect(s.fullyPaid).toBe(true)
  })

  it('sans échéancier : la facture entière tient lieu d’échéance unique', () => {
    expect(invoiceSettlement({ status: 'SENT', totalCents: 40_000, installments: [] })).toMatchObject({
      collectedCents: 0,
      outstandingCents: 40_000,
      partCount: 1,
      fullyPaid: false,
    })
    expect(invoiceSettlement({ status: 'PAID', totalCents: 40_000, installments: [] })).toMatchObject({
      collectedCents: 40_000,
      outstandingCents: 0,
      fullyPaid: true,
    })
  })

  it('une facture annulée ne doit plus rien, même partiellement encaissée', () => {
    const s = invoiceSettlement({
      status: 'CANCELLED',
      totalCents: 60_000,
      installments: [part(20_000, true), part(40_000)],
    })
    expect(s).toMatchObject({ billedCents: 0, collectedCents: 0, outstandingCents: 0, fullyPaid: false })
  })

  it('cashPosition : les brouillons sont isolés, jamais comptés comme créance', () => {
    const position = cashPosition([
      { status: 'SENT', totalCents: 60_000, installments: [part(20_000, true), part(40_000)] },
      { status: 'PAID', totalCents: 40_000, installments: [] },
      { status: 'DRAFT', totalCents: 30_000, installments: [] },
      { status: 'CANCELLED', totalCents: 99_000, installments: [] },
    ])
    expect(position.collectedCents).toBe(60_000) // 200 € + 400 €
    expect(position.outstandingCents).toBe(40_000) // la seule créance réelle
    expect(position.draftCents).toBe(30_000)
    expect(position.billedCents).toBe(130_000) // l’annulée ne compte nulle part
  })

  it('cashPosition : une échéance cochée sur un brouillon est bien de l’argent reçu', () => {
    const position = cashPosition([
      { status: 'DRAFT', totalCents: 40_000, installments: [part(20_000, true), part(20_000)] },
    ])
    expect(position.collectedCents).toBe(20_000)
    expect(position.outstandingCents).toBe(0)
    expect(position.draftCents).toBe(20_000)
  })

  it('cashPosition : rien à compter', () => {
    expect(cashPosition([])).toEqual({ collectedCents: 0, outstandingCents: 0, draftCents: 0, billedCents: 0 })
  })

  it('statusFromInstallments : le statut suit les encaissements', () => {
    const parts = [part(20_000, true), part(20_000)]
    expect(statusFromInstallments({ status: 'SENT', totalCents: 40_000, installments: parts })).toBe('SENT')
    expect(
      statusFromInstallments({ status: 'SENT', totalCents: 40_000, installments: [part(20_000, true), part(20_000, true)] }),
    ).toBe('PAID')
    // Décocher une échéance remet la facture en attente.
    expect(statusFromInstallments({ status: 'PAID', totalCents: 40_000, installments: parts })).toBe('SENT')
  })

  it('statusFromInstallments : brouillon et annulée ne bougent pas', () => {
    const soldé = [part(20_000, true)]
    expect(statusFromInstallments({ status: 'DRAFT', totalCents: 20_000, installments: soldé })).toBe('DRAFT')
    expect(statusFromInstallments({ status: 'CANCELLED', totalCents: 20_000, installments: soldé })).toBe('CANCELLED')
  })
})
