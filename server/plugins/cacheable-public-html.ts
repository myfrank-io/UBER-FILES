// Les pages publiques ('/', '/{slug}', '/inscription') sont servies avec swr :
// le CDN Vercel ne met JAMAIS en cache une réponse portant un Set-Cookie. Or
// nuxt-i18n pose `i18n_locale` au premier rendu SSR de chaque nouveau visiteur
// — exactement la population que le cache doit servir : sans ce filtre, le
// cache HTML ne s'amorce jamais. Le cookie est redondant côté serveur : le
// client le (re)pose lui-même après hydratation, et le sélecteur de langue
// l'écrit aussi. On le retire donc des réponses HTML publiques cachables — et
// uniquement lui : tout autre Set-Cookie est conservé.

const SINGLE_SEGMENT = /^\/[^/]*$/ // '/' et pages à un seul segment (/{slug}…)
const EXCLUDED = /^\/(?:api|_nuxt|_fonts|dashboard|admin)(?:\/|$)/

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (event.method !== 'GET') return
    const path = event.path.split('?')[0] ?? ''
    if (!SINGLE_SEGMENT.test(path) || EXCLUDED.test(path)) return

    const setCookie = getResponseHeader(event, 'set-cookie')
    if (!setCookie) return
    const kept = (Array.isArray(setCookie) ? setCookie : [String(setCookie)]).filter(
      (c) => !c.startsWith('i18n_locale='),
    )
    if (kept.length === 0) removeResponseHeader(event, 'set-cookie')
    else setResponseHeader(event, 'set-cookie', kept)
  })
})
