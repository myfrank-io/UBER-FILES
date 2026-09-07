// Facturation : logique pure, partagée entre l'API admin, l'écran de saisie et
// le rendu PDF. Aucun accès base ni DOM ici — tout est testable en isolation.

/** Une ligne de facture telle qu'elle est saisie. */
export type InvoiceLineInput = {
  /** Désignation, éventuellement sur plusieurs lignes (« Accès RideWiz\n+ paramétrage »). */
  label: string
  quantity: number
  unitPriceCents: number
}

/** Une échéance de règlement (« Acompte de 50 % à la commande »). */
export type InstallmentInput = {
  /** Part du total, en centièmes de pour-cent (5000 = 50 %) pour éviter les flottants. */
  shareBasisPoints: number
  /** Quand c'est dû, tel qu'on l'écrit sur la facture : « à la commande », « à la livraison ». */
  dueLabel: string
}

export type Installment = InstallmentInput & { amountCents: number }

/** Montant d'une ligne. Les quantités sont entières, les prix en centimes. */
export function lineAmountCents(line: Pick<InvoiceLineInput, 'quantity' | 'unitPriceCents'>): number {
  return Math.round(line.quantity * line.unitPriceCents)
}

/**
 * Totaux d'une facture. Pas de TVA en franchise en base (art. 293 B du CGI) :
 * le total est le sous-total. `vatRateBasisPoints` permet de facturer avec TVA
 * si l'émetteur sort un jour de la franchise.
 */
export function invoiceTotals(lines: InvoiceLineInput[], vatRateBasisPoints = 0) {
  const subtotalCents = lines.reduce((sum, line) => sum + lineAmountCents(line), 0)
  const vatCents = Math.round((subtotalCents * vatRateBasisPoints) / 10_000)
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents }
}

/**
 * Répartit un total entre les échéances. Les arrondis vont tous sur la
 * DERNIÈRE échéance : la somme des échéances est toujours exactement le total,
 * jamais un centime de plus ou de moins (une facture qui ne tombe pas juste
 * est un litige garanti).
 */
export function splitInstallments(totalCents: number, parts: InstallmentInput[]): Installment[] {
  if (parts.length === 0) return []
  const head = parts.slice(0, -1).map((part) => ({
    ...part,
    amountCents: Math.round((totalCents * part.shareBasisPoints) / 10_000),
  }))
  const allocated = head.reduce((sum, part) => sum + part.amountCents, 0)
  const last = parts[parts.length - 1]!
  return [...head, { ...last, amountCents: totalCents - allocated }]
}

/**
 * Répartition par défaut pour un règlement « en N fois » : parts égales, le
 * reliquat de pour-cent sur la première (un acompte rond se lit mieux qu'un
 * solde à 33,34 %).
 */
export function evenShares(count: number): number[] {
  if (count < 1) return []
  const base = Math.floor(10_000 / count)
  const shares = Array.from({ length: count }, () => base)
  shares[0] += 10_000 - base * count
  return shares
}

/** « 400 € », « 1 234,50 € » — format français, centimes masqués si nuls. */
export function formatEuros(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const units = Math.floor(abs / 100)
  const decimals = abs % 100
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return decimals === 0
    ? `${sign}${grouped} €`
    : `${sign}${grouped},${String(decimals).padStart(2, '0')} €`
}

/** « 50 % », « 33,33 % » — depuis des centièmes de pour-cent. */
export function formatShare(basisPoints: number): string {
  const percent = basisPoints / 100
  return `${String(Number(percent.toFixed(2))).replace('.', ',')} %`
}

/**
 * Numéro suivant d'une série : incrémente le dernier groupe de chiffres en
 * conservant sa longueur. « 2606-16 » → « 2606-17 », « FA-2026-009 » →
 * « FA-2026-010 ». Sans numéro précédent, on part de la série de l'année.
 */
export function nextInvoiceNumber(previous: string | null | undefined, now = new Date()): string {
  if (!previous?.trim()) {
    const year = String(now.getFullYear()).slice(-2)
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}${month}-01`
  }
  const match = previous.trim().match(/^(.*?)(\d+)(\D*)$/)
  if (!match) return `${previous.trim()}-2`
  const [, prefix, digits, suffix] = match as unknown as [string, string, string, string]
  const incremented = String(Number(digits) + 1).padStart(digits.length, '0')
  return `${prefix}${incremented}${suffix}`
}

/** Clé de tri d'un numéro de facture : les chiffres, pour comparer 2606-9 < 2606-16. */
export function invoiceNumberSortKey(number: string): number {
  const digits = number.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

/**
 * Clé de Luhn d'un SIRET (14 chiffres) ou d'un SIREN (9). Sert à ne pas
 * interroger l'annuaire des entreprises avec un numéro manifestement faux.
 * La Poste (SIREN 356000000) est la seule exception connue à la règle.
 */
export function isValidSiren(value: string): boolean {
  const digits = value.replace(/\s/g, '')
  if (!/^\d{9}$/.test(digits)) return false
  if (digits === '356000000') return true
  return luhnValid(digits)
}

export function isValidSiret(value: string): boolean {
  const digits = value.replace(/\s/g, '')
  if (!/^\d{14}$/.test(digits)) return false
  if (digits.startsWith('356000000')) return true
  return luhnValid(digits)
}

function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i
    let digit = Number(digits[i])
    if (fromRight % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** Normalise une saisie SIRET/SIREN : on accepte les espaces au collage. */
export function normalizeSiret(value: string): string {
  return value.replace(/[^\d]/g, '')
}

/** « 902 378 819 00012 » — lecture humaine d'un SIRET. */
export function formatSiret(value: string): string {
  const digits = normalizeSiret(value)
  if (digits.length === 14) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return value
}

/**
 * Phrase de modalités de paiement, telle qu'elle s'imprime sur la facture.
 * Une seule échéance = règlement comptant ; deux = acompte + solde (la forme
 * la plus courante) ; au-delà, on énumère. Le texte reste modifiable à la main
 * dans l'écran de saisie : cette fonction ne fait que proposer le défaut.
 */
export function paymentTermsSentence(installments: Installment[]): string {
  if (installments.length === 0) return ''
  if (installments.length === 1) {
    const only = installments[0]!
    const when = only.dueLabel.trim() || 'à réception de la présente facture'
    return `Modalités de paiement : règlement de la totalité, soit ${formatEuros(only.amountCents)}, ${when}.`
  }
  if (installments.length === 2) {
    const [first, second] = installments as [Installment, Installment]
    const firstWhen = first.dueLabel.trim() ? `${first.dueLabel.trim()}, ` : ''
    const secondWhen = second.dueLabel.trim() || 'à la livraison'
    return (
      `Modalités de paiement : acompte de ${formatShare(first.shareBasisPoints)} ${firstWhen}` +
      `soit ${formatEuros(first.amountCents)}, à régler à réception de la présente facture. ` +
      `Le solde de ${formatShare(second.shareBasisPoints)}, soit ${formatEuros(second.amountCents)}, ` +
      `sera dû ${secondWhen}.`
    )
  }
  const parts = installments.map((part) => {
    const when = part.dueLabel.trim() ? ` ${part.dueLabel.trim()}` : ''
    return `${formatShare(part.shareBasisPoints)} (${formatEuros(part.amountCents)})${when}`
  })
  return `Modalités de paiement : règlement en ${installments.length} fois — ${parts.join(', ')}.`
}

/** Mention de TVA. En franchise en base, l'article 293 B du CGI est obligatoire. */
export function vatMention(vatRateBasisPoints: number): string {
  return vatRateBasisPoints === 0
    ? 'TVA non applicable, article 293 B du CGI'
    : `TVA ${formatShare(vatRateBasisPoints)}`
}

/**
 * Mention de pénalités de retard. Obligatoire entre professionnels
 * (art. L441-10 et D441-5 du code de commerce) : son absence est sanctionnable,
 * on ne la rend donc pas optionnelle.
 */
export const LATE_PAYMENT_MENTION =
  'En cas de retard de paiement, application de pénalités au taux de trois fois le taux d’intérêt légal, ' +
  'ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du code de commerce).'

/**
 * Articles vendus habituellement, proposés en un clic dans l'éditeur. Ce ne
 * sont que des points de départ : la désignation et le prix restent
 * modifiables ligne par ligne sur chaque facture.
 */
export const INVOICE_PRESETS: { key: string; chip: string; label: string; unitPriceCents: number }[] = [
  {
    key: 'acces',
    // `chip` : ce qui s'affiche sur le bouton ; `label` : ce qui s'imprime.
    chip: 'Accès + paramétrage',
    label: 'Accès Ridewiz\n+ paramétrage',
    unitPriceCents: 40_000,
  },
  {
    key: 'cartes',
    chip: 'Lot de 20 cartes',
    label: 'Création 20 cartes (2 × 10)\nAvis Google + carte de visite digitale\nLogo',
    unitPriceCents: 20_000,
  },
  {
    key: 'acces-cartes',
    chip: 'Accès + QR + cartes',
    label: 'Accès Ridewiz\n+ paramétrage\nmise en place QR code + cartes',
    unitPriceCents: 40_000,
  },
]

/** Échéances les plus fréquentes, proposées dans la liste déroulante. */
export const DUE_LABEL_SUGGESTIONS = [
  'à la commande',
  'à la livraison',
  'à réception de la présente facture',
  'sous 30 jours',
]

/** Échéancier par défaut pour un règlement en N fois. */
export function defaultInstallments(count: number): InstallmentInput[] {
  const shares = evenShares(count)
  return shares.map((shareBasisPoints, index) => ({
    shareBasisPoints,
    dueLabel:
      count === 1
        ? 'à réception de la présente facture'
        : index === 0
          ? 'à la commande'
          : index === shares.length - 1
            ? 'à la livraison'
            : `échéance ${index + 1}`,
  }))
}
