import { describe, it, expect } from 'vitest'
import { buildVCard, escapeVCardValue, foldVCardLine, vcardFilename } from './vcard'

// Les valeurs attendues contenant des antislashs sont écrites avec String.raw :
// en littéral classique, '\;' vaut ';' et le test passerait à côté du bug.

describe('escapeVCardValue', () => {
  it('échappe l’antislash, le point-virgule et la virgule', () => {
    expect(escapeVCardValue(String.raw`a\b`)).toBe(String.raw`a\\b`)
    expect(escapeVCardValue('Dupont;Jean')).toBe(String.raw`Dupont\;Jean`)
    expect(escapeVCardValue('Paris, France')).toBe(String.raw`Paris\, France`)
  })

  it('transforme les retours à la ligne en séquence littérale \\n', () => {
    expect(escapeVCardValue('ligne1\nligne2')).toBe(String.raw`ligne1\nligne2`)
    expect(escapeVCardValue('ligne1\r\nligne2')).toBe(String.raw`ligne1\nligne2`)
  })

  it('échappe l’antislash avant les autres (pas de double échappement)', () => {
    // « \; » saisi tel quel : l'antislash d'origine est protégé (\\), puis le
    // point-virgule est échappé à son tour (\;) → « \\\; » (4 caractères).
    expect(escapeVCardValue(String.raw`\;`)).toBe(String.raw`\\\;`)
  })
})

describe('foldVCardLine', () => {
  it('laisse les lignes courtes intactes', () => {
    expect(foldVCardLine('FN:Karim')).toBe('FN:Karim')
  })

  it('plie au-delà de 75 caractères avec une espace de continuation', () => {
    const source = 'NOTE:' + 'a'.repeat(200)
    const lines = foldVCardLine(source).split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]!.length).toBe(75)
    for (const l of lines.slice(1)) expect(l.startsWith(' ')).toBe(true)
    // Le pliage est réversible : on retrouve la ligne d'origine.
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(source)
  })
})

/** Défait le pliage RFC 2426 pour comparer des lignes logiques. */
function unfold(vcf: string): string[] {
  return vcf
    .split('\r\n')
    .reduce<string[]>((acc, line) => {
      if (line.startsWith(' ') && acc.length) acc[acc.length - 1] += line.slice(1)
      else acc.push(line)
      return acc
    }, [])
    .filter((l) => l !== '')
}

describe('buildVCard', () => {
  it('produit une fiche minimale valide', () => {
    const vcf = buildVCard({ displayName: 'Karim' })
    expect(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(unfold(vcf)).toContain('FN:Karim')
    expect(unfold(vcf)).toContain('N:Karim;;;;')
    expect(vcf.endsWith('END:VCARD\r\n')).toBe(true)
  })

  it('utilise des fins de ligne CRLF, sans \\n orphelin', () => {
    const vcf = buildVCard({ displayName: 'Karim', phone: '+33612345678' })
    expect(vcf.includes('\r\n')).toBe(true)
    expect(/[^\r]\n/.test(vcf)).toBe(false)
  })

  it('n’émet que les champs renseignés', () => {
    const vcf = buildVCard({ displayName: 'Karim', email: null, phone: '' })
    expect(vcf).not.toContain('EMAIL')
    expect(vcf).not.toContain('TEL')
    expect(vcf).not.toContain('ORG')
  })

  it('inclut tous les champs fournis', () => {
    const lines = unfold(
      buildVCard({
        displayName: 'Karim VTC',
        company: 'Karim Transports',
        title: 'Chauffeur VTC · Paris',
        phone: '+33 6 12 34 56 78',
        email: 'karim@exemple.fr',
        url: 'https://ridewiz.fr/carte/karim',
        address: '10 rue de Rivoli, Paris',
      }),
    )
    expect(lines).toContain('ORG:Karim Transports')
    expect(lines).toContain('TITLE:Chauffeur VTC · Paris')
    expect(lines).toContain('TEL;TYPE=CELL,VOICE:+33 6 12 34 56 78')
    expect(lines).toContain('EMAIL;TYPE=INTERNET:karim@exemple.fr')
    expect(lines).toContain('URL:https://ridewiz.fr/carte/karim')
    expect(lines).toContain(String.raw`ADR;TYPE=WORK:;;10 rue de Rivoli\, Paris;;;;`)
  })

  it('échappe les séparateurs du nom sans casser la structure de N', () => {
    const lines = unfold(buildVCard({ displayName: 'Martin; Paul' }))
    expect(lines).toContain(String.raw`FN:Martin\; Paul`)
    // Les 4 points-virgules de structure de N restent, eux, non échappés.
    expect(lines).toContain(String.raw`N:Martin\; Paul;;;;`)
  })

  it('tronque une note trop longue à 300 caractères', () => {
    const vcf = buildVCard({ displayName: 'Karim', note: 'x'.repeat(500) })
    const note = unfold(vcf).find((l) => l.startsWith('NOTE:'))!
    expect(note.slice('NOTE:'.length).length).toBe(300)
  })

  it('retombe sur « Contact » quand le nom est vide', () => {
    expect(buildVCard({ displayName: '   ' })).toContain('FN:Contact')
  })
})

describe('vcardFilename', () => {
  it('translittère les accents et assainit', () => {
    expect(vcardFilename('Karim — Chauffeur VTC')).toBe('karim-chauffeur-vtc.vcf')
    expect(vcardFilename('Frédéric Õ')).toBe('frederic-o.vcf')
  })

  it('retombe sur contact.vcf quand il ne reste rien', () => {
    expect(vcardFilename('———')).toBe('contact.vcf')
    expect(vcardFilename('')).toBe('contact.vcf')
  })
})
