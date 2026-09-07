// Rendu canvas des scènes de la banque de logos (lib/logo-bank.ts) : vignettes
// de l'éditeur et PNG final (fond transparent) qui devient le logo du chauffeur.
// Les polices sont celles de la page (auto-hébergées par @nuxt/fonts) : le
// canvas y accède directement, contrairement à un SVG chargé comme image.
import type { LogoFont, LogoItem, LogoScene, TextItem } from '~/lib/logo-bank'

export interface LogoColors {
  primary: string
  accent: string
  inverse: string
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

function color(token: 'primary' | 'accent' | 'inverse', colors: LogoColors): string {
  return colors[token]
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
  ctx.fillStyle = color(it.color, colors)
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
  ctx.fillStyle = color(it.color, colors)
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
    case 'circle':
      ctx.beginPath()
      ctx.arc(it.cx, it.cy, it.r, 0, Math.PI * 2)
      if (it.fill) {
        ctx.fillStyle = color(it.fill, colors)
        ctx.fill()
      }
      if (it.stroke) {
        ctx.strokeStyle = color(it.stroke, colors)
        ctx.lineWidth = it.lw ?? 2
        ctx.stroke()
      }
      return
    case 'poly':
      ctx.beginPath()
      it.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      if (!it.open) ctx.closePath()
      if (it.fill) {
        ctx.fillStyle = color(it.fill, colors)
        ctx.fill()
      }
      if (it.stroke) {
        ctx.strokeStyle = color(it.stroke, colors)
        ctx.lineWidth = it.lw ?? 2
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      return
    case 'line':
      ctx.beginPath()
      ctx.moveTo(it.x1, it.y1)
      ctx.lineTo(it.x2, it.y2)
      ctx.strokeStyle = color(it.stroke, colors)
      ctx.lineWidth = it.lw
      ctx.lineCap = 'round'
      ctx.stroke()
      return
    case 'path': {
      const path = new Path2D(it.d)
      ctx.save()
      ctx.translate(it.x, it.y)
      ctx.scale(it.size / 100, it.size / 100)
      if (it.fill) {
        ctx.fillStyle = color(it.fill, colors)
        ctx.fill(path)
      }
      if (it.stroke) {
        ctx.strokeStyle = color(it.stroke, colors)
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
