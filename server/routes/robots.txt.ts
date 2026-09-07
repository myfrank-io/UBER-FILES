export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Disallow: /dashboard/',
    'Disallow: /admin/',
    'Disallow: /devis/',
    // Liens à jeton envoyés aux chauffeurs (proposition de cartes, adresse
    // de livraison) : privés, aucun intérêt à être explorés.
    'Disallow: /cartes-nfc/',
    'Disallow: /livraison/',
    'Disallow: /reservation/',
    'Disallow: /api/',
    'Disallow: /auth/',
    '',
    `Sitemap: ${process.env.APP_BASE_URL || 'http://localhost:3000'}/sitemap.xml`,
  ].join('\n')
})
