// Facturation : logique pure, partagée entre l'API admin, l'écran de saisie et
// le rendu PDF. Aucun accès base ni DOM ici — tout est testable en isolation.

/** Forme d'une remise de ligne. « Offert » est un PERCENT à 100 %. */
export type DiscountKind = 'NONE' | 'PERCENT' | 'AMOUNT'

/** Une ligne de facture telle qu'elle est saisie. */
export type InvoiceLineInput = {
  /** Désignation, éventuellement sur plusieurs lignes (« Accès Ridewiz\n+ paramétrage »). */
  label: string
  quantity: number
  unitPriceCents: number
  discountKind?: DiscountKind
  /** Centièmes de pour-cent si PERCENT (10000 = offert), centimes si AMOUNT. */
  discountValue?: number
}

/**
 * Une échéance de règlement (« acompte de 200 € à la commande »).
 *
 * C'est le MONTANT qui fait foi, jamais un pourcentage : 600 € en trois fois,
 * c'est 200 / 200 / 200, et non 33,34 % / 33,33 % / 33,33 % qui donnerait
 * 200,04 / 199,98 / 199,98. La part en pour-cent n'est qu'un affichage,
 * déduite du montant.
 */
export type InstallmentInput = {
  amountCents: number
  /** Quand c'est dû, tel qu'on l'écrit sur la facture : « à la commande », « à la livraison ». */
  dueLabel: string
}

/** Montant d'une ligne AVANT remise. Les quantités sont entières, les prix en centimes. */
export function lineGrossCents(line: Pick<InvoiceLineInput, 'quantity' | 'unitPriceCents'>): number {
  return Math.round(line.quantity * line.unitPriceCents)
}

/**
 * Remise accordée sur une ligne, jamais supérieure au montant de la ligne :
 * une remise ne crée pas un avoir au milieu d'une facture.
 */
export function lineDiscountCents(line: InvoiceLineInput): number {
  const gross = lineGrossCents(line)
  const value = line.discountValue ?? 0
  if (value <= 0) return 0
  const raw =
    line.discountKind === 'PERCENT'
      ? Math.round((gross * Math.min(value, 10_000)) / 10_000)
      : line.discountKind === 'AMOUNT'
        ? value
        : 0
  return Math.min(raw, gross)
}

/** Montant réellement facturé pour la ligne, remise déduite. */
export function lineNetCents(line: InvoiceLineInput): number {
  return lineGrossCents(line) - lineDiscountCents(line)
}

/** Une ligne offerte : entièrement remisée, mais dont la valeur reste affichée. */
export function isLineFree(line: InvoiceLineInput): boolean {
  const gross = lineGrossCents(line)
  return gross > 0 && lineDiscountCents(line) === gross
}

/**
 * Mention de remise imprimée sous la désignation. « Offert — valeur 50 € »
 * plutôt qu'une ligne à zéro : le client doit voir ce qui lui a été donné.
 */
export function discountLabel(line: InvoiceLineInput): string | null {
  const discount = lineDiscountCents(line)
  if (discount === 0) return null
  const gross = lineGrossCents(line)
  if (isLineFree(line)) return `Offert — valeur ${formatEuros(gross)}`
  if (line.discountKind === 'PERCENT') {
    return `Remise ${formatShare(line.discountValue ?? 0)} — ${formatEuros(discount)}`
  }
  return `Remise — ${formatEuros(discount)}`
}

/**
 * Totaux d'une facture. L'émetteur est en franchise en base (art. 293 B du
 * CGI) : il n'y a pas de TVA, le total est le sous-total. `vatRateBasisPoints`
 * reste accepté pour le jour où la franchise ne s'appliquerait plus.
 */
export function invoiceTotals(lines: InvoiceLineInput[], vatRateBasisPoints = 0) {
  const grossCents = lines.reduce((sum, line) => sum + lineGrossCents(line), 0)
  const discountCents = lines.reduce((sum, line) => sum + lineDiscountCents(line), 0)
  const subtotalCents = grossCents - discountCents
  const vatCents = Math.round((subtotalCents * vatRateBasisPoints) / 10_000)
  return { grossCents, discountCents, subtotalCents, vatCents, totalCents: subtotalCents + vatCents }
}

/**
 * Découpe un total en `count` échéances RONDES. Chaque échéance est un nombre
 * entier d'euros ; les euros qui ne tombent pas juste sont distribués un par un
 * depuis la première, et les centimes éventuels atterrissent sur la première.
 * La somme vaut toujours exactement le total — une facture qui ne tombe pas
 * juste est un litige garanti.
 *
 *   600 € en 3 fois → 200 / 200 / 200
 *   500 € en 3 fois → 167 / 167 / 166
 *   400 € en 3 fois → 134 / 133 / 133
 */
export function splitAmountsEvenly(totalCents: number, count: number): number[] {
  if (count < 1) return []
  if (count === 1) return [totalCents]

  const base = Math.floor(totalCents / count / 100) * 100
  const parts = Array.from({ length: count }, () => base)
  let rest = totalCents - base * count
  for (let i = 0; rest >= 100; i++) {
    parts[i % count]! += 100
    rest -= 100
  }
  parts[0]! += rest
  return parts
}

/** Part d'un montant dans le total, en centièmes de pour-cent (5000 = 50 %). */
export function shareBasisPoints(amountCents: number, totalCents: number): number {
  if (totalCents === 0) return 0
  return Math.round((amountCents * 10_000) / totalCents)
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
 * la plus courante) ; au-delà, on énumère les montants.
 *
 * Le pourcentage n'est mentionné que s'il tombe rond : « acompte de 50 % » se
 * lit bien, « acompte de 33,34 % » non — dans ce cas seul le montant est
 * annoncé, qui est de toute façon ce que le client doit régler. Le texte reste
 * modifiable à la main : cette fonction ne fait que proposer le défaut.
 */
export function paymentTermsSentence(installments: InstallmentInput[]): string {
  if (installments.length === 0) return ''
  const total = installments.reduce((sum, part) => sum + part.amountCents, 0)

  /** « 50 % » si la part tombe sur un pour-cent entier, sinon rien. */
  const roundShare = (amountCents: number): string | null => {
    if (total === 0) return null
    const bps = (amountCents * 10_000) / total
    return Number.isInteger(bps) && bps % 100 === 0 ? formatShare(bps) : null
  }

  if (installments.length === 1) {
    const only = installments[0]!
    const when = only.dueLabel.trim() || 'à réception de la présente facture'
    return `Modalités de paiement : règlement de la totalité, soit ${formatEuros(only.amountCents)}, ${when}.`
  }

  if (installments.length === 2) {
    const [first, second] = installments as [InstallmentInput, InstallmentInput]
    const firstWhen = first.dueLabel.trim()
    const secondWhen = second.dueLabel.trim() || 'à la livraison'
    const firstShare = roundShare(first.amountCents)
    const secondShare = roundShare(second.amountCents)

    const acompte = firstShare
      ? `acompte de ${firstShare}${firstWhen ? ` ${firstWhen}` : ''}, soit ${formatEuros(first.amountCents)}`
      : `acompte de ${formatEuros(first.amountCents)}${firstWhen ? ` ${firstWhen}` : ''}`
    const solde = secondShare
      ? `Le solde de ${secondShare}, soit ${formatEuros(second.amountCents)},`
      : `Le solde, soit ${formatEuros(second.amountCents)},`
    return `Modalités de paiement : ${acompte}, à régler à réception de la présente facture. ${solde} sera dû ${secondWhen}.`
  }

  const parts = installments.map((part) => {
    const when = part.dueLabel.trim() ? ` ${part.dueLabel.trim()}` : ''
    return `${formatEuros(part.amountCents)}${when}`
  })
  return `Modalités de paiement : règlement en ${installments.length} fois — ${parts.join(', ')}.`
}

/**
 * Mention de TVA. L'émetteur est en franchise en base (auto-entrepreneur) :
 * l'article 293 B du CGI est alors une mention obligatoire.
 */
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

/** Échéances les plus fréquentes, proposées dans la liste déroulante. */
export const DUE_LABEL_SUGGESTIONS = [
  'à la commande',
  'à la livraison',
  'à réception de la présente facture',
  'sous 30 jours',
]

/** Échéancier par défaut pour un règlement « en N fois », à montants ronds. */
export function defaultInstallments(totalCents: number, count: number): InstallmentInput[] {
  const amounts = splitAmountsEvenly(totalCents, count)
  return amounts.map((amountCents, index) => ({
    amountCents,
    dueLabel:
      count === 1
        ? 'à réception de la présente facture'
        : index === 0
          ? 'à la commande'
          : index === amounts.length - 1
            ? 'à la livraison'
            : `échéance ${index + 1}`,
  }))
}

/** Lien public d'une facture, tel qu'on l'envoie au chauffeur. */
export function invoiceShareUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/facture/${encodeURIComponent(token)}`
}

/**
 * Message WhatsApp pré-rempli pour envoyer sa facture au chauffeur. On tutoie :
 * ce sont des indépendants qu'on suit un par un, pas des inconnus.
 */
export function invoiceWhatsAppMessage(opts: {
  /** Nom du chauffeur, complet ou non : seul le prénom est utilisé. */
  driverName: string
  number: string
  totalCents: number
  url: string
  paymentTerms: string | null
}): string {
  const firstName = opts.driverName.trim().split(/\s+/)[0] ?? ''
  const hello = firstName ? `Salut ${firstName} 👋` : 'Salut 👋'
  const terms = opts.paymentTerms?.trim()
  return [
    hello,
    '',
    `Voici ta facture n°${opts.number} — ${formatEuros(opts.totalCents)} :`,
    opts.url,
    ...(terms ? ['', terms] : []),
    '',
    'Dis-moi si tu as une question.',
  ].join('\n')
}
