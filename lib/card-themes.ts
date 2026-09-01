// Banque de thèmes de la carte de visite — données PURES.
//
// Les quatre premiers restent en accès direct dans l'éditeur ; les autres
// vivent derrière un bouton « + ». Chaque palette est validée automatiquement
// par card-themes.test.ts : un thème dont le texte ne contrasterait pas assez
// avec son fond fait échouer la suite, il ne peut donc pas atteindre la prod.

export interface CardTheme {
  key: string
  label: string
  /** Famille d'affichage dans la banque étendue. */
  group: 'clair' | 'sombre' | 'colore'
  tokens: {
    bg: string
    surface: string
    text: string
    muted: string
    border: string
    accent: string
    accentText: string
  }
}

export const THEME_GROUPS: { key: CardTheme['group']; label: string }[] = [
  { key: 'clair', label: 'Clairs' },
  { key: 'sombre', label: 'Sombres' },
  { key: 'colore', label: 'Affirmés' },
]

/**
 * Thèmes montrés d'emblée dans l'éditeur. Les autres restent à un clic, sans
 * encombrer l'écran de celui qui ne cherche rien de particulier.
 */
export const QUICK_THEME_KEYS = ['signature', 'nuit', 'ivoire', 'ardoise']

export const CARD_THEMES: CardTheme[] = [
  // ── Clairs ────────────────────────────────────────────────────────────────
  {
    key: 'signature',
    label: 'Signature',
    group: 'clair',
    tokens: { bg: '#FBF7F0', surface: '#FFFFFF', text: '#16283D', muted: '#6C7889', border: '#EFE7D8', accent: '#B5793F', accentText: '#FFFFFF' },
  },
  {
    key: 'ivoire',
    label: 'Ivoire',
    group: 'clair',
    tokens: { bg: '#F1EADB', surface: '#FFFFFF', text: '#16283D', muted: '#63707F', border: '#E4DCCC', accent: '#9C6431', accentText: '#FFFFFF' },
  },
  {
    key: 'porcelaine',
    label: 'Porcelaine',
    group: 'clair',
    tokens: { bg: '#FFFFFF', surface: '#F6F8FA', text: '#0F172A', muted: '#51607A', border: '#E3E8EF', accent: '#1E3A8A', accentText: '#FFFFFF' },
  },
  {
    key: 'lin',
    label: 'Lin',
    group: 'clair',
    tokens: { bg: '#FAF3EE', surface: '#FFFFFF', text: '#3A2318', muted: '#6F5245', border: '#EEDDD2', accent: '#A8442D', accentText: '#FFFFFF' },
  },
  {
    key: 'brume',
    label: 'Brume',
    group: 'clair',
    tokens: { bg: '#F4F6F8', surface: '#FFFFFF', text: '#1B2B3A', muted: '#546679', border: '#DFE6EC', accent: '#2A6C8F', accentText: '#FFFFFF' },
  },
  {
    key: 'sauge',
    label: 'Sauge',
    group: 'clair',
    tokens: { bg: '#F2F5F1', surface: '#FFFFFF', text: '#1E2C22', muted: '#53645A', border: '#DDE6DC', accent: '#3F6046', accentText: '#FFFFFF' },
  },

  // ── Sombres ───────────────────────────────────────────────────────────────
  {
    key: 'nuit',
    label: 'Nuit',
    group: 'sombre',
    tokens: { bg: '#0E1B2C', surface: '#16283D', text: '#F1EADB', muted: '#A9B4C2', border: '#22334A', accent: '#E0B579', accentText: '#0E1B2C' },
  },
  {
    key: 'ardoise',
    label: 'Ardoise',
    group: 'sombre',
    tokens: { bg: '#22334A', surface: '#2C3E57', text: '#F5F7FA', muted: '#B6C2D1', border: '#3C4A5A', accent: '#CB985D', accentText: '#16283D' },
  },
  {
    key: 'onyx',
    label: 'Onyx',
    group: 'sombre',
    tokens: { bg: '#101114', surface: '#1A1C21', text: '#F5F5F7', muted: '#A1A5AE', border: '#2A2D34', accent: '#D8D8DC', accentText: '#101114' },
  },
  {
    key: 'minuit',
    label: 'Minuit',
    group: 'sombre',
    tokens: { bg: '#0B1220', surface: '#131C2E', text: '#E8EEF7', muted: '#9BAAC0', border: '#1F2A3E', accent: '#5EA9E6', accentText: '#06101E' },
  },
  {
    key: 'foret',
    label: 'Forêt',
    group: 'sombre',
    tokens: { bg: '#0F1A14', surface: '#17251C', text: '#E9F1EA', muted: '#9BB0A2', border: '#22342A', accent: '#79C08C', accentText: '#0B1610' },
  },
  {
    key: 'cacao',
    label: 'Cacao',
    group: 'sombre',
    tokens: { bg: '#1B1512', surface: '#271F1A', text: '#F3EBE4', muted: '#B7A79A', border: '#362B24', accent: '#D9A066', accentText: '#1B1512' },
  },
  {
    key: 'bordeaux',
    label: 'Bordeaux',
    group: 'sombre',
    tokens: { bg: '#1A0E13', surface: '#26161C', text: '#F6EBEE', muted: '#BFA3AC', border: '#35222A', accent: '#D98A9E', accentText: '#1A0E13' },
  },

  // ── Affirmés ──────────────────────────────────────────────────────────────
  {
    key: 'cuivre',
    label: 'Cuivre',
    group: 'colore',
    tokens: { bg: '#FFF6EE', surface: '#FFFFFF', text: '#3B2416', muted: '#7A5541', border: '#F0DCC9', accent: '#B23C08', accentText: '#FFFFFF' },
  },
  {
    key: 'emeraude',
    label: 'Émeraude',
    group: 'colore',
    tokens: { bg: '#F0F7F3', surface: '#FFFFFF', text: '#10251B', muted: '#4A6559', border: '#D6E7DD', accent: '#0F766E', accentText: '#FFFFFF' },
  },
  {
    key: 'cobalt',
    label: 'Cobalt',
    group: 'colore',
    tokens: { bg: '#F1F5FD', surface: '#FFFFFF', text: '#0F1B33', muted: '#4A5B7A', border: '#D9E3F5', accent: '#1D4ED8', accentText: '#FFFFFF' },
  },
  {
    key: 'prune',
    label: 'Prune',
    group: 'colore',
    tokens: { bg: '#F7F2F8', surface: '#FFFFFF', text: '#241528', muted: '#65506A', border: '#E8DCEA', accent: '#7E22CE', accentText: '#FFFFFF' },
  },
  {
    key: 'terracotta',
    label: 'Terracotta',
    group: 'colore',
    tokens: { bg: '#FBF1EC', surface: '#FFFFFF', text: '#33201A', muted: '#75564B', border: '#EFD9CE', accent: '#9A3412', accentText: '#FFFFFF' },
  },
]

export const DEFAULT_THEME = 'signature'

export function cardTheme(key: string | null | undefined): CardTheme {
  return CARD_THEMES.find((t) => t.key === key) ?? CARD_THEMES[0]!
}

/** Déclaration `style` prête à poser sur le conteneur racine de la carte. */
export function themeCssVars(key: string | null | undefined): Record<string, string> {
  const { tokens } = cardTheme(key)
  return {
    '--card-bg': tokens.bg,
    '--card-surface': tokens.surface,
    '--card-text': tokens.text,
    '--card-muted': tokens.muted,
    '--card-border': tokens.border,
    '--card-accent': tokens.accent,
    '--card-accent-text': tokens.accentText,
  }
}

// ── Contraste ───────────────────────────────────────────────────────────────

/** Composantes 0-255 d'une couleur `#rrggbb`, ou null si la notation est invalide. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luminance relative WCAG. */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21), ou null si invalide. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la === null || lb === null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
