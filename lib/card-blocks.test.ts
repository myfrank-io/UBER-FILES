import { describe, it, expect } from 'vitest'
import {
  safeExternalUrl,
  telDigits,
  toWhatsAppDigits,
  safeEmail,
  normalizeBlock,
  blockHref,
  isExternalHref,
  blockLabel,
  buildDefaultBlocks,
  SOCIAL_NETWORKS,
} from './card-blocks'

describe('safeExternalUrl', () => {
  it('accepte http et https', () => {
    expect(safeExternalUrl('https://exemple.fr')).toBe('https://exemple.fr/')
    expect(safeExternalUrl('http://exemple.fr/page')).toBe('http://exemple.fr/page')
  })

  it('préfixe https sur un domaine nu', () => {
    expect(safeExternalUrl('exemple.fr')).toBe('https://exemple.fr/')
    expect(safeExternalUrl('  instagram.com/karim  ')).toBe('https://instagram.com/karim')
  })

  it('rejette les schémas dangereux', () => {
    // Le cœur de la sécurité de la page : elle affiche des liens saisis par
    // le chauffeur, jamais un schéma exécutable.
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull()
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull()
    expect(safeExternalUrl('tel:+33612345678')).toBeNull()
  })

  it('rejette le vide et les hôtes non qualifiés', () => {
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl('   ')).toBeNull()
    expect(safeExternalUrl('localhost')).toBeNull()
    expect(safeExternalUrl('pas une url')).toBeNull()
  })

  it('normalise une URL protocol-relative en https', () => {
    expect(safeExternalUrl('//exemple.fr/x')).toBe('https://exemple.fr/x')
  })

  it('conserve le chemin, la query et le fragment', () => {
    expect(safeExternalUrl('https://exemple.fr/a/b?c=1#d')).toBe('https://exemple.fr/a/b?c=1#d')
  })
})

describe('telDigits', () => {
  it('conserve le + international et ne garde que les chiffres', () => {
    expect(telDigits('+33 6 12 34 56 78')).toBe('+33612345678')
    expect(telDigits('06.12.34.56.78')).toBe('0612345678')
    expect(telDigits('(01) 23-45-67-89')).toBe('0123456789')
  })

  it('rejette ce qui n’est pas un numéro plausible', () => {
    expect(telDigits(null)).toBeNull()
    expect(telDigits('')).toBeNull()
    expect(telDigits('12345')).toBeNull()
    expect(telDigits('1'.repeat(16))).toBeNull()
    expect(telDigits('abc')).toBeNull()
  })
})

describe('toWhatsAppDigits', () => {
  it('garde un numéro déjà international', () => {
    expect(toWhatsAppDigits('+33 6 12 34 56 78')).toBe('33612345678')
    expect(toWhatsAppDigits('+1 415 555 0100')).toBe('14155550100')
  })

  it('complète un numéro national avec l’indicatif par défaut', () => {
    // Sans cela, wa.me/0612345678 mènerait à un compte inexistant.
    expect(toWhatsAppDigits('06 12 34 56 78')).toBe('33612345678')
    expect(toWhatsAppDigits('0612345678')).toBe('33612345678')
  })

  it('gère le préfixe 00', () => {
    expect(toWhatsAppDigits('0033612345678')).toBe('33612345678')
  })

  it('respecte un indicatif par défaut différent', () => {
    expect(toWhatsAppDigits('0612345678', '32')).toBe('32612345678')
  })

  it('rejette les numéros invalides', () => {
    expect(toWhatsAppDigits(null)).toBeNull()
    expect(toWhatsAppDigits('')).toBeNull()
    expect(toWhatsAppDigits('123')).toBeNull()
    expect(toWhatsAppDigits('abc')).toBeNull()
    expect(toWhatsAppDigits('+' + '1'.repeat(16))).toBeNull()
  })
})

describe('safeEmail', () => {
  it('normalise en minuscules', () => {
    expect(safeEmail('  Karim@Exemple.FR ')).toBe('karim@exemple.fr')
  })

  it('rejette les adresses invalides', () => {
    expect(safeEmail('karim@')).toBeNull()
    expect(safeEmail('karim@exemple')).toBeNull()
    expect(safeEmail('a b@c.fr')).toBeNull()
    expect(safeEmail(null)).toBeNull()
  })
})

describe('normalizeBlock', () => {
  it('refuse un type inconnu', () => {
    const r = normalizeBlock({ kind: 'NOPE' as never })
    expect(r.ok).toBe(false)
  })

  it('ignore la valeur des blocs dérivés du profil', () => {
    for (const kind of ['BOOKING_CTA', 'REVIEW_CTA', 'VEHICLES'] as const) {
      const r = normalizeBlock({ kind, value: 'https://pirate.fr', label: '  Réserver  ' })
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.block.value).toBeNull()
        expect(r.block.label).toBe('Réserver')
      }
    }
  })

  it('valide un lien et le normalise', () => {
    const r = normalizeBlock({ kind: 'LINK', value: 'exemple.fr', label: 'Mon site' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.block.value).toBe('https://exemple.fr/')
  })

  it('refuse un lien dangereux', () => {
    const r = normalizeBlock({ kind: 'LINK', value: 'javascript:alert(1)' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Lien invalide')
  })

  it('exige un réseau connu pour un bloc social', () => {
    expect(normalizeBlock({ kind: 'SOCIAL', value: 'https://x.com/a', data: {} }).ok).toBe(false)
    expect(
      normalizeBlock({ kind: 'SOCIAL', value: 'https://x.com/a', data: { network: 'myspace' } }).ok,
    ).toBe(false)
    const r = normalizeBlock({
      kind: 'SOCIAL',
      value: 'instagram.com/karim',
      data: { network: 'instagram', pirate: 'oui' },
    })
    expect(r.ok).toBe(true)
    // Seule la clé attendue est conservée : pas de données arbitraires en base.
    if (r.ok) expect(r.block.data).toEqual({ network: 'instagram' })
  })

  it('valide téléphone, WhatsApp et email', () => {
    expect(normalizeBlock({ kind: 'PHONE', value: '06 12 34 56 78' }).ok).toBe(true)
    expect(normalizeBlock({ kind: 'PHONE', value: '123' }).ok).toBe(false)
    expect(normalizeBlock({ kind: 'WHATSAPP', value: '+33612345678' }).ok).toBe(true)
    expect(normalizeBlock({ kind: 'WHATSAPP', value: 'abc' }).ok).toBe(false)
    const e = normalizeBlock({ kind: 'EMAIL', value: ' Karim@Exemple.fr ' })
    expect(e.ok).toBe(true)
    if (e.ok) expect(e.block.value).toBe('karim@exemple.fr')
  })

  it('refuse un texte ou une adresse vides', () => {
    expect(normalizeBlock({ kind: 'TEXT', value: '   ' }).ok).toBe(false)
    expect(normalizeBlock({ kind: 'ADDRESS', value: '' }).ok).toBe(false)
  })

  it('tronque les valeurs trop longues au lieu de planter', () => {
    const r = normalizeBlock({ kind: 'TEXT', value: 'a'.repeat(5000) })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.block.value!.length).toBe(1200)
  })
})

describe('blockHref', () => {
  const b = (kind: string, value: string | null = null, data: Record<string, unknown> | null = null) =>
    ({ id: 'x', kind, label: null, value, data }) as never

  it('pointe les CTA vers les routes internes du produit', () => {
    expect(blockHref(b('BOOKING_CTA'), 'karim')).toBe('/karim')
    expect(blockHref(b('REVIEW_CTA'), 'karim')).toBe('/avis/karim')
  })

  it('construit tel:, mailto: et wa.me', () => {
    expect(blockHref(b('PHONE', '06 12 34 56 78'), 'k')).toBe('tel:0612345678')
    expect(blockHref(b('EMAIL', 'karim@exemple.fr'), 'k')).toBe('mailto:karim@exemple.fr')
    expect(blockHref(b('WHATSAPP', '0612345678'), 'k')).toBe('https://wa.me/33612345678')
  })

  it('encode l’adresse dans le lien Maps', () => {
    expect(blockHref(b('ADDRESS', '10 rue de Rivoli, Paris'), 'k')).toBe(
      'https://www.google.com/maps/search/?api=1&query=10%20rue%20de%20Rivoli%2C%20Paris',
    )
  })

  it('revalide les liens à la lecture, pas seulement à l’écriture', () => {
    // Défense en profondeur : même si une valeur douteuse atteignait la base,
    // la page publique ne produirait pas de href exécutable.
    expect(blockHref(b('LINK', 'javascript:alert(1)'), 'k')).toBeNull()
    expect(blockHref(b('SOCIAL', 'javascript:alert(1)', { network: 'x' }), 'k')).toBeNull()
  })

  it('ne donne pas de lien aux blocs sans destination', () => {
    expect(blockHref(b('TEXT', 'coucou'), 'k')).toBeNull()
    expect(blockHref(b('VEHICLES'), 'k')).toBeNull()
  })
})

describe('isExternalHref', () => {
  it('distingue interne et externe', () => {
    expect(isExternalHref('https://wa.me/33')).toBe(true)
    expect(isExternalHref('/karim')).toBe(false)
    expect(isExternalHref('tel:0612345678')).toBe(false)
    expect(isExternalHref(null)).toBe(false)
  })
})

describe('blockLabel', () => {
  it('préfère le libellé du chauffeur', () => {
    expect(blockLabel({ id: 'x', kind: 'PHONE', label: 'Mon portable', value: null, data: null })).toBe(
      'Mon portable',
    )
  })

  it('retombe sur le libellé par défaut', () => {
    expect(blockLabel({ id: 'x', kind: 'PHONE', label: '  ', value: null, data: null })).toBe('Appeler')
    expect(
      blockLabel({ id: 'x', kind: 'SOCIAL', label: null, value: null, data: { network: 'linkedin' } }),
    ).toBe('LinkedIn')
  })
})

describe('buildDefaultBlocks', () => {
  const base = {
    phone: null,
    contactEmail: null,
    hasVehicles: false,
    hasReviewLink: false,
    bio: null,
  }

  it('propose toujours au moins le bouton de réservation', () => {
    const blocks = buildDefaultBlocks(base)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.kind).toBe('BOOKING_CTA')
    expect(blocks[0]!.position).toBe(0)
  })

  it('dérive les blocs de ce que Ridewiz sait déjà du chauffeur', () => {
    const blocks = buildDefaultBlocks({
      phone: '06 12 34 56 78',
      contactEmail: 'karim@exemple.fr',
      hasVehicles: true,
      hasReviewLink: true,
      bio: 'Chauffeur depuis 10 ans.',
    })
    expect(blocks.map((b) => b.kind)).toEqual([
      'BOOKING_CTA',
      'PHONE',
      'WHATSAPP',
      'EMAIL',
      'TEXT',
      'VEHICLES',
      'REVIEW_CTA',
    ])
    // Les positions sont contiguës et ordonnées.
    expect(blocks.map((b) => b.position)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('n’ajoute pas de bloc pour une donnée invalide', () => {
    const blocks = buildDefaultBlocks({ ...base, phone: '123', contactEmail: 'pas-un-email' })
    expect(blocks.map((b) => b.kind)).toEqual(['BOOKING_CTA'])
  })
})

describe('réseaux sociaux', () => {
  it('n’a pas de clé en double', () => {
    const keys = SOCIAL_NETWORKS.map((n) => n.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
