import { describe, expect, it } from 'vitest'
import {
  LOGO_CATEGORIES,
  LOGO_H,
  LOGO_TEMPLATES,
  LOGO_W,
  deriveInitials,
  findLogoTemplate,
  normalizeLogoInput,
  regularPolygon,
  sceneWithinBounds,
  splitName,
  starPolygon,
} from './logo-bank'

const input = { initials: 'KD', name: 'Kerkar Drive', tagline: 'Chauffeur Privé' }

describe('deriveInitials', () => {
  it('prend la première lettre des deux premiers mots, sans accents', () => {
    expect(deriveInitials('Kerkar Drive')).toBe('KD')
    expect(deriveInitials('Élise Durand-Martin')).toBe('ED')
    expect(deriveInitials('  guy  ')).toBe('G')
    expect(deriveInitials('Les Chauffeurs de Paris')).toBe('LC')
    expect(deriveInitials('')).toBe('')
    expect(deriveInitials(null)).toBe('')
  })
})

describe('splitName / normalizeLogoInput', () => {
  it('sépare prénom et reste', () => {
    expect(splitName('Guy Kerkar')).toEqual(['Guy', 'Kerkar'])
    expect(splitName('Guy')).toEqual(['Guy', ''])
    expect(splitName('Jean Paul Martin')).toEqual(['Jean', 'Paul Martin'])
  })

  it('normalise espaces et initiales', () => {
    expect(normalizeLogoInput({ initials: ' kd ', name: 'Kerkar   Drive ', tagline: undefined })).toEqual({
      initials: 'KD',
      name: 'Kerkar Drive',
      tagline: '',
    })
    expect(normalizeLogoInput({ initials: 'abcd' }).initials).toBe('ABC')
  })
})

describe('géométrie', () => {
  it('regularPolygon : n sommets sur le cercle', () => {
    const pts = regularPolygon(0, 0, 10, 6)
    expect(pts).toHaveLength(6)
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(10)
    expect(pts[0]![1]).toBeCloseTo(-10) // premier sommet en haut
  })

  it('starPolygon : alterne rayon externe et interne', () => {
    const pts = starPolygon(0, 0, 10, 4)
    expect(pts).toHaveLength(10)
    expect(Math.hypot(...pts[0]!)).toBeCloseTo(10)
    expect(Math.hypot(...pts[1]!)).toBeCloseTo(4)
  })
})

describe('LOGO_TEMPLATES', () => {
  it('identifiants uniques, catégories connues, chaque catégorie fournie', () => {
    const ids = LOGO_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of LOGO_TEMPLATES) expect(LOGO_CATEGORIES).toContain(t.category)
    for (const c of LOGO_CATEGORIES) expect(LOGO_TEMPLATES.some((t) => t.category === c)).toBe(true)
    expect(LOGO_TEMPLATES.length).toBeGreaterThanOrEqual(20)
  })

  it('chaque modèle produit une scène dans le repère, avec le nom ou les initiales', () => {
    for (const t of LOGO_TEMPLATES) {
      const s = t.build(input)
      expect(s.w).toBe(LOGO_W)
      expect(s.h).toBe(LOGO_H)
      expect(s.items.length).toBeGreaterThan(0)
      expect(sceneWithinBounds(s), t.id).toBe(true)
      const texts = s.items
        .filter((i) => i.t === 'text' || i.t === 'arcText')
        .map((i) => (i as { text: string }).text.toLowerCase())
      expect(texts.some((x) => x.includes('kerkar') || x.includes('kd')), t.id).toBe(true)
    }
  })

  it('reste valide sans sous-titre ni nom', () => {
    for (const t of LOGO_TEMPLATES) {
      const s = t.build({ initials: 'G', name: '', tagline: '' })
      expect(sceneWithinBounds(s), t.id).toBe(true)
      for (const it of s.items) {
        if (it.t === 'text' || it.t === 'arcText') expect(it.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('findLogoTemplate', () => {
    expect(findLogoTemplate('seal')?.label).toBe('Sceau')
    expect(findLogoTemplate('nope')).toBeUndefined()
  })
})
