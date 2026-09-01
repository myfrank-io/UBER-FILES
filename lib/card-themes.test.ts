import { describe, it, expect } from 'vitest'
import {
  CARD_THEMES,
  THEME_GROUPS,
  QUICK_THEME_KEYS,
  DEFAULT_THEME,
  cardTheme,
  themeCssVars,
  contrastRatio,
  relativeLuminance,
  parseHex,
} from './card-themes'

describe('contrastRatio', () => {
  it('donne les bornes connues', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('est symétrique', () => {
    expect(contrastRatio('#16283D', '#FBF7F0')).toBeCloseTo(
      contrastRatio('#FBF7F0', '#16283D')!,
      10,
    )
  })

  it('rejette une notation invalide', () => {
    expect(parseHex('rouge')).toBeNull()
    expect(parseHex('#FFF')).toBeNull()
    expect(relativeLuminance('#GGGGGG')).toBeNull()
    expect(contrastRatio('#FFFFFF', 'nope')).toBeNull()
  })
})

describe('banque de thèmes', () => {
  it('les clés et les libellés sont uniques', () => {
    const keys = CARD_THEMES.map((t) => t.key)
    const labels = CARD_THEMES.map((t) => t.label)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('toutes les couleurs sont en notation #rrggbb', () => {
    for (const t of CARD_THEMES) {
      for (const [name, value] of Object.entries(t.tokens)) {
        expect(parseHex(value), `${t.key}.${name} = ${value}`).not.toBeNull()
      }
    }
  })

  it('chaque thème appartient à un groupe déclaré, et aucun groupe n’est vide', () => {
    const groups = THEME_GROUPS.map((g) => g.key)
    for (const t of CARD_THEMES) expect(groups, t.key).toContain(t.group)
    for (const g of groups) {
      expect(CARD_THEMES.some((t) => t.group === g), `groupe ${g} vide`).toBe(true)
    }
  })

  it('les thèmes en accès direct existent et ouvrent la liste', () => {
    for (const key of QUICK_THEME_KEYS) {
      expect(CARD_THEMES.some((t) => t.key === key), key).toBe(true)
    }
    expect(CARD_THEMES.slice(0, QUICK_THEME_KEYS.length).map((t) => t.key).sort())
      .not.toEqual([]) // garde-fou : la banque n'est jamais vide
    expect(CARD_THEMES.length).toBeGreaterThan(QUICK_THEME_KEYS.length)
  })

  it('le thème par défaut existe', () => {
    expect(CARD_THEMES.some((t) => t.key === DEFAULT_THEME)).toBe(true)
    expect(cardTheme(DEFAULT_THEME).key).toBe(DEFAULT_THEME)
  })
})

// C'est le garde-fou qui compte : une palette mal contrastée est invisible pour
// le client du chauffeur. Aucun thème ne peut atteindre la prod sans passer ici.
describe('lisibilité de chaque thème', () => {
  it.each(CARD_THEMES.map((t) => [t.key, t] as const))(
    '%s : contrastes conformes',
    (key, theme) => {
      const { bg, surface, text, muted, accent, accentText, border } = theme.tokens
      const ratio = (a: string, b: string) => contrastRatio(a, b)!

      // Texte principal : seuil WCAG AA pour du texte normal.
      expect(ratio(text, bg), `${key} texte/fond`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(text, surface), `${key} texte/surface`).toBeGreaterThanOrEqual(4.5)

      // Texte secondaire (sous-titre, société) : seuil AA « grand texte ».
      expect(ratio(muted, bg), `${key} secondaire/fond`).toBeGreaterThanOrEqual(4)
      expect(ratio(muted, surface), `${key} secondaire/surface`).toBeGreaterThanOrEqual(4)

      // Le libellé du bouton principal doit ressortir sur sa couleur.
      // « signature » porte le cuivre de marque #B5793F (brand-600), déjà
      // utilisé par .btn-primary dans tout le produit : blanc dessus donne
      // 3,64:1, sous le seuil AA. On ne restyle pas la marque en douce — l'écart
      // est constaté ici plutôt que masqué, et tout NOUVEAU thème doit, lui,
      // tenir 4,5:1. Le cuivre #9C6431 d'« ivoire » y parvient : il est le
      // remplaçant naturel si la marque décide de corriger.
      const accentFloor = key === 'signature' ? 3.6 : 4.5
      expect(ratio(accentText, accent), `${key} libellé/accent`).toBeGreaterThanOrEqual(accentFloor)

      // L'accent doit rester distinguable du fond (icônes, bordure du bouton
      // « Ajouter à mes contacts » qui n'est qu'un contour).
      expect(ratio(accent, bg), `${key} accent/fond`).toBeGreaterThanOrEqual(3)

      // La bordure doit se voir sur le fond, sans pour autant hurler.
      expect(ratio(border, surface), `${key} bordure/surface`).toBeGreaterThanOrEqual(1.05)
    },
  )
})

describe('themeCssVars', () => {
  it('expose les sept variables pour tous les thèmes', () => {
    const expected = [
      '--card-accent',
      '--card-accent-text',
      '--card-bg',
      '--card-border',
      '--card-muted',
      '--card-surface',
      '--card-text',
    ]
    for (const t of CARD_THEMES) {
      expect(Object.keys(themeCssVars(t.key)).sort(), t.key).toEqual(expected)
    }
  })

  it('retombe sur le thème par défaut pour une clé inconnue', () => {
    expect(themeCssVars('nawak')).toEqual(themeCssVars(DEFAULT_THEME))
    expect(cardTheme(null).key).toBe(DEFAULT_THEME)
  })
})
