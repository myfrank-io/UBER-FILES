// Génération de fiche contact vCard 3.0 — logique PURE et testée.
//
// C'est le bouton le plus utile d'une carte de visite digitale : le client tape
// « Ajouter à mes contacts » et le chauffeur atterrit dans son répertoire.
// Version 3.0 (et non 4.0) : c'est celle que iOS et Android importent sans
// broncher. Fins de ligne CRLF et échappement conformes à la RFC 2426.

export interface VCardInput {
  displayName: string
  company?: string | null
  title?: string | null
  phone?: string | null
  email?: string | null
  url?: string | null
  address?: string | null
  note?: string | null
}

const MAX_NOTE = 300

/**
 * Échappement RFC 2426 : antislash, point-virgule et virgule sont protégés,
 * les retours à la ligne deviennent la séquence littérale `\n`.
 */
export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Pliage des lignes longues (RFC 2426 §2.6) : au-delà de 75 caractères, on
 * poursuit sur la ligne suivante préfixée d'une espace. Certains lecteurs
 * tronquent sans cela.
 */
export function foldVCardLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export function buildVCard(input: VCardInput): string {
  const name = input.displayName.trim() || 'Contact'
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']

  // N attend 5 composants (nom;prénom;…) ; on n'a qu'un nom d'affichage.
  lines.push(`N:${escapeVCardValue(name)};;;;`)
  lines.push(`FN:${escapeVCardValue(name)}`)

  const org = input.company?.trim()
  if (org) lines.push(`ORG:${escapeVCardValue(org)}`)

  const title = input.title?.trim()
  if (title) lines.push(`TITLE:${escapeVCardValue(title)}`)

  const phone = input.phone?.trim()
  if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardValue(phone)}`)

  const email = input.email?.trim()
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(email)}`)

  const url = input.url?.trim()
  if (url) lines.push(`URL:${escapeVCardValue(url)}`)

  const address = input.address?.trim()
  // ADR attend 7 composants ; l'adresse libre va dans « rue ».
  if (address) lines.push(`ADR;TYPE=WORK:;;${escapeVCardValue(address)};;;;`)

  const note = input.note?.trim()
  if (note) lines.push(`NOTE:${escapeVCardValue(note.slice(0, MAX_NOTE))}`)

  lines.push('END:VCARD')

  return lines.map(foldVCardLine).join('\r\n') + '\r\n'
}

/** Nom de fichier ASCII sûr pour l'en-tête Content-Disposition. */
export function vcardFilename(displayName: string): string {
  const base = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return `${base || 'contact'}.vcf`
}
