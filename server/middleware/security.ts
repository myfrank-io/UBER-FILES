import type { H3Event } from 'h3'

// ─── Rate limiting ────────────────────────────────────────────────────────────
// In-memory sliding window. Best-effort sur instance unique (Vercel).
// Chaque règle définit : pattern d'URL, limite de hits, fenêtre en ms.

interface RateRule {
  pattern: RegExp
  limit: number
  windowMs: number
}

const RULES: RateRule[] = [
  // Soumission de demande : 5 / heure par IP
  { pattern: /^\/api\/public\/[^/]+\/request$/, limit: 5, windowMs: 60 * 60 * 1000 },
  // Estimation de prix : 30 / minute par IP
  { pattern: /^\/api\/public\/[^/]+\/estimate$/, limit: 30, windowMs: 60 * 1000 },
  // Retour d'avis privé : 5 / heure par IP (public, déclenche un email chauffeur)
  { pattern: /^\/api\/public\/[^/]+\/review-feedback$/, limit: 5, windowMs: 60 * 60 * 1000 },
  // Autocomplete / geocode : 60 / minute par IP
  { pattern: /^\/api\/public\/(autocomplete|geocode)$/, limit: 60, windowMs: 60 * 1000 },
  // Login : 10 tentatives / 15 minutes par IP
  { pattern: /^\/api\/auth\/login$/, limit: 10, windowMs: 15 * 60 * 1000 },
  // Reset password : 3 / heure par IP
  { pattern: /^\/api\/auth\/(forgot|reset)-password$/, limit: 3, windowMs: 60 * 60 * 1000 },
  // Ouverture du parcours de configuration par jeton : 20 / 15 minutes par IP
  { pattern: /^\/api\/setup\/open$/, limit: 20, windowMs: 15 * 60 * 1000 },
  // Code par email : envoi 6 / 15 min, vérification 30 / 15 min par IP
  { pattern: /^\/api\/setup\/send-code$/, limit: 6, windowMs: 15 * 60 * 1000 },
  { pattern: /^\/api\/setup\/verify-code$/, limit: 30, windowMs: 15 * 60 * 1000 },
]

// Map<ruleIndex:ip, timestamps[]>
const store = new Map<string, number[]>()

// Nettoyage périodique pour éviter les fuites mémoire
setInterval(
  () => {
    const now = Date.now()
    for (const [key, timestamps] of store) {
      const ruleIndex = parseInt(key.split(':')[0])
      const rule = RULES[ruleIndex]
      if (!rule) { store.delete(key); continue }
      const filtered = timestamps.filter((t) => now - t < rule.windowMs)
      if (filtered.length === 0) store.delete(key)
      else store.set(key, filtered)
    }
  },
  5 * 60 * 1000,
)

function checkRateLimit(ip: string, path: string): { limited: boolean; retryAfter?: number } {
  const now = Date.now()
  for (let i = 0; i < RULES.length; i++) {
    const rule = RULES[i]
    if (!rule.pattern.test(path)) continue
    const key = `${i}:${ip}`
    const hits = (store.get(key) ?? []).filter((t) => now - t < rule.windowMs)
    if (hits.length >= rule.limit) {
      const oldest = Math.min(...hits)
      const retryAfter = Math.ceil((oldest + rule.windowMs - now) / 1000)
      return { limited: true, retryAfter }
    }
    hits.push(now)
    store.set(key, hits)
    return { limited: false }
  }
  return { limited: false }
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

function getAllowedOrigins(): string[] {
  const base = process.env.APP_BASE_URL || 'http://localhost:3000'
  const origins = [base]
  // Support preview Vercel (*.vercel.app)
  if (base.includes('vercel.app')) {
    const project = base.replace(/https?:\/\//, '').split('.')[0]
    origins.push(`https://${project}.vercel.app`)
  }
  return origins
}

function handleCors(event: H3Event): boolean {
  const origin = getHeader(event, 'origin')
  if (!origin) return false

  const allowed = getAllowedOrigins()
  const isAllowed = allowed.some((o) => origin === o || origin.startsWith(o))

  if (isAllowed) {
    setHeader(event, 'Access-Control-Allow-Origin', origin)
    setHeader(event, 'Access-Control-Allow-Credentials', 'true')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type,Authorization')
    setHeader(event, 'Vary', 'Origin')
  }

  // Preflight
  if (getMethod(event) === 'OPTIONS') {
    setResponseStatus(event, 204)
    return true
  }

  return false
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname

  // Security headers sur toutes les réponses HTML + API
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'X-Frame-Options', 'DENY')
  setHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  // CSP permissif mais protège contre XSS et clickjacking
  setHeader(
    event,
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // Nuxt hydration nécessite unsafe-inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      // tiles.openfreemap.org : style + tuiles vectorielles + glyphes de la
      // carte de suivi de course (chargés en fetch par MapLibre).
      "connect-src 'self' https://api.stripe.com https://maps.googleapis.com https://api.resend.com https://tiles.openfreemap.org",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "font-src 'self'",
      // MapLibre exécute son parsing de tuiles dans un Web Worker créé via blob:
      // (child-src : repli des navigateurs sans worker-src).
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  )

  // CORS (uniquement pour les routes API)
  if (path.startsWith('/api/')) {
    const handled = handleCors(event)
    if (handled) return
  }

  // Rate limiting (uniquement pour les routes API publiques/auth)
  if (
    path.startsWith('/api/public/')
    || path.startsWith('/api/auth/')
    || path === '/api/setup/open'
    || path === '/api/setup/send-code'
    || path === '/api/setup/verify-code'
  ) {
    const ip =
      getHeader(event, 'x-forwarded-for')?.split(',')[0].trim() ||
      getHeader(event, 'x-real-ip') ||
      event.node.req.socket?.remoteAddress ||
      'unknown'

    const { limited, retryAfter } = checkRateLimit(ip, path)
    if (limited) {
      setHeader(event, 'Retry-After', retryAfter ?? 60)
      throw createError({
        statusCode: 429,
        statusMessage: 'Trop de requêtes. Veuillez réessayer dans quelques instants.',
      })
    }
  }
})
