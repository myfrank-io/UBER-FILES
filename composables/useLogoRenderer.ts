// Rendu canvas des scènes de la banque de logos (lib/logo-bank.ts) : vignettes
// de l'éditeur et PNG final (fond transparent) qui devient le logo du chauffeur.
// Les polices sont celles de la page (auto-hébergées par @nuxt/fonts) : le
// canvas y accède directement, contrairement à un SVG chargé comme image.
import {
  findLogoTemplate,
  normalizeLogoInput,
  resolveLogoColor,
  type LogoColorToken,
  type LogoFont,
  type LogoItem,
  type LogoRecipe,
  type LogoScene,
  type LogoTheme,
  type TextItem,
} from '~/lib/logo-bank'

export interface LogoColors {
  primary: string
  accent: string
  inverse: string
  /** Effet métal : l'accent est rendu en dégradé brossé (clair → teinte → sombre). */
  metallic?: boolean
}

const FONT_STACKS: Record<LogoFont, { family: string; weight: number; style: 'normal' | 'italic' }> = {
  serif: { family: '"DM Serif Display", Georgia, serif', weight: 400, style: 'normal' },
  serifItalic: { family: '"DM Serif Display", Georgia, serif', weight: 400, style: 'italic' },
  sans: { family: '"DM Sans", system-ui, sans-serif', weight: 500, style: 'normal' },
  sansBold: { family: '"DM Sans", system-ui, sans-serif', weight: 700, style: 'normal' },
  grotesk: { family: '"Space Grotesk", "DM Sans", sans-serif', weight: 600, style: 'normal' },
  elegant: { family: '"Cormorant Garamond", "DM Serif Display", Georgia, serif', weight: 600, style: 'normal' },
  elegantItalic: { family: '"Cormorant Garamond", "DM Serif Display", Georgia, serif', weight: 600, style: 'italic' },
  caps: { family: 'Cinzel, "DM Serif Display", Georgia, serif', weight: 600, style: 'normal' },
}

function fontString(font: LogoFont, size: number): string {
  const f = FONT_STACKS[font]
  return `${f.style} ${f.weight} ${size}px ${f.family}`
}

let fontsReady: Promise<void> | null = null

/** Charge une fois toutes les polices du rendu (sans bloquer si l'une manque). */
export function ensureLogoFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve()
  fontsReady = Promise.all(
    (Object.keys(FONT_STACKS) as LogoFont[]).map((k) => document.fonts.load(fontString(k, 40)).catch(() => [])),
  ).then(() => undefined)
  return fontsReady
}

type Ctx = CanvasRenderingContext2D

/** Mélange d'une couleur #RRGGBB avec du blanc (amount > 0) ou du noir (amount < 0). */
function mix(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const target = amount > 0 ? 255 : 0
    return Math.round(v + (target - v) * Math.abs(amount))
  })
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

interface Bounds {
  y0: number
  y1: number
}

/**
 * Style de remplissage/trait d'un jeton. L'accent « métal » est un dégradé
 * vertical calé sur la hauteur de l'élément : reflet clair en haut, teinte au
 * milieu, ombre en bas — l'effet or brossé des logos haut de gamme.
 */
function paint(ctx: Ctx, token: LogoColorToken, colors: LogoColors, b: Bounds): string | CanvasGradient {
  if (token !== 'accent' || !colors.metallic) return colors[token]
  const y0 = Math.min(b.y0, b.y1)
  const y1 = Math.max(b.y0, b.y1) + (b.y1 === b.y0 ? 1 : 0)
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, mix(colors.accent, 0.55))
  g.addColorStop(0.42, colors.accent)
  g.addColorStop(0.58, mix(colors.accent, 0.3))
  g.addColorStop(1, mix(colors.accent, -0.4))
  return g
}

/** Largeur d'un texte avec interlettrage (le corps réel peut avoir été réduit par maxWidth). */
function measureTracked(ctx: Ctx, chars: string[], tracking: number): number {
  return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + tracking * Math.max(0, chars.length - 1)
}

function drawText(ctx: Ctx, it: TextItem, colors: LogoColors) {
  const value = it.upper ? it.text.toLocaleUpperCase('fr-FR') : it.text
  if (!value) return
  const chars = [...value]
  let size = it.size
  ctx.font = fontString(it.font, size)
  let tracking = (it.tracking ?? 0) * size
  let width = measureTracked(ctx, chars, tracking)
  if (it.maxWidth && width > it.maxWidth) {
    size = Math.max(8, size * (it.maxWidth / width))
    ctx.font = fontString(it.font, size)
    tracking = (it.tracking ?? 0) * size
    width = measureTracked(ctx, chars, tracking)
  }
  ctx.fillStyle = paint(ctx, it.color, colors, { y0: it.y - size * 0.75, y1: it.y })
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let x = it.x - width / 2
  for (const ch of chars) {
    ctx.fillText(ch, x, it.y)
    x += ctx.measureText(ch).width + tracking
  }
}

function drawArcText(ctx: Ctx, it: Extract<LogoItem, { t: 'arcText' }>, colors: LogoColors) {
  const value = it.upper ? it.text.toLocaleUpperCase('fr-FR') : it.text
  const chars = [...value]
  if (!chars.length) return
  ctx.font = fontString(it.font, it.size)
  ctx.fillStyle = paint(ctx, it.color, colors, { y0: it.cy - it.r, y1: it.cy + it.r })
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  // Répartition des glyphes proportionnelle à leur largeur sur l'arc.
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0)
  const spread = (it.spread * Math.PI) / 180
  const top = it.side === 'top'
  // Sur le haut, on lit de gauche à droite en tournant dans le sens horaire ;
  // sur le bas, de gauche à droite dans le sens antihoraire (glyphes retournés).
  const start = top ? -Math.PI / 2 - spread / 2 : Math.PI / 2 + spread / 2
  let acc = 0
  chars.forEach((ch, i) => {
    const frac = (acc + widths[i]! / 2) / total
    const angle = top ? start + spread * frac : start - spread * frac
    acc += widths[i]!
    ctx.save()
    ctx.translate(it.cx + it.r * Math.cos(angle), it.cy + it.r * Math.sin(angle))
    ctx.rotate(angle + (top ? Math.PI / 2 : -Math.PI / 2))
    ctx.fillText(ch, 0, top ? 0 : it.size * 0.72)
    ctx.restore()
  })
}

function drawItem(ctx: Ctx, it: LogoItem, colors: LogoColors) {
  switch (it.t) {
    case 'text':
      drawText(ctx, it, colors)
      return
    case 'arcText':
      drawArcText(ctx, it, colors)
      return
    case 'circle': {
      const b = { y0: it.cy - it.r, y1: it.cy + it.r }
      ctx.beginPath()
      ctx.arc(it.cx, it.cy, it.r, 0, Math.PI * 2)
      if (it.fill) {
        ctx.fillStyle = paint(ctx, it.fill, colors, b)
        ctx.fill()
      }
      if (it.stroke) {
        ctx.strokeStyle = paint(ctx, it.stroke, colors, b)
        ctx.lineWidth = it.lw ?? 2
        ctx.stroke()
      }
      return
    }
    case 'poly': {
      const ys = it.points.map((p) => p[1])
      const b = { y0: Math.min(...ys), y1: Math.max(...ys) }
      ctx.beginPath()
      it.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      if (!it.open) ctx.closePath()
      if (it.fill) {
        ctx.fillStyle = paint(ctx, it.fill, colors, b)
        ctx.fill()
      }
      if (it.stroke) {
        ctx.strokeStyle = paint(ctx, it.stroke, colors, b)
        ctx.lineWidth = it.lw ?? 2
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      return
    }
    case 'line':
      ctx.beginPath()
      ctx.moveTo(it.x1, it.y1)
      ctx.lineTo(it.x2, it.y2)
      ctx.strokeStyle = paint(ctx, it.stroke, colors, { y0: Math.min(it.y1, it.y2) - it.lw, y1: Math.max(it.y1, it.y2) + it.lw })
      ctx.lineWidth = it.lw
      ctx.lineCap = 'round'
      ctx.stroke()
      return
    case 'path': {
      const path = new Path2D(it.d)
      // Le dégradé est calculé dans le repère local (0-100) du tracé.
      const b = { y0: 0, y1: 100 }
      ctx.save()
      ctx.translate(it.x, it.y)
      ctx.scale(it.size / 100, it.size / 100)
      if (it.fill) {
        ctx.fillStyle = paint(ctx, it.fill, colors, b)
        ctx.fill(path)
      }
      if (it.stroke) {
        ctx.strokeStyle = paint(ctx, it.stroke, colors, b)
        // L'épaisseur est exprimée en unités du repère 0-100.
        ctx.lineWidth = it.lw ?? 2
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke(path)
      }
      ctx.restore()
      return
    }
  }
}

export interface RenderOptions {
  /** Largeur du canvas en px (la hauteur suit le ratio de la scène). */
  width: number
  /** Couleur de fond (vignettes) ; absente = transparent (PNG final). */
  background?: string
}

/** Dessine la scène dans un canvas neuf. */
export function renderLogoScene(scene: LogoScene, colors: LogoColors, opts: RenderOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const scale = opts.width / scene.w
  canvas.width = Math.round(scene.w * scale)
  canvas.height = Math.round(scene.h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible.')
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.scale(scale, scale)
  for (const it of scene.items) drawItem(ctx, it, colors)
  return canvas
}

export function logoSceneToDataUrl(scene: LogoScene, colors: LogoColors, opts: RenderOptions): string {
  return renderLogoScene(scene, colors, opts).toDataURL('image/png')
}

/** Couleurs de rendu d'une recette, jetons « suit le thème » résolus. */
export function logoColorsFromRecipe(recipe: LogoRecipe, theme: LogoTheme): LogoColors {
  return {
    primary: resolveLogoColor(recipe.primary, theme),
    accent: resolveLogoColor(recipe.accent, theme),
    inverse: theme.background,
    metallic: recipe.metallic,
  }
}

/**
 * Re-rend le PNG final d'une recette (1600 px de large : ~40 mm imprimés à
 * bien plus de 300 dpi). Renvoie null si la recette n'a pas de modèle ou si
 * le modèle a disparu de la banque.
 */
export async function renderLogoFromRecipe(
  recipe: LogoRecipe,
  theme: LogoTheme,
  width = 1600,
): Promise<string | null> {
  if (!recipe.templateId) return null
  const template = findLogoTemplate(recipe.templateId)
  if (!template) return null
  await ensureLogoFonts()
  const scene = template.build(normalizeLogoInput(recipe))
  return logoSceneToDataUrl(scene, logoColorsFromRecipe(recipe, theme), { width })
}
