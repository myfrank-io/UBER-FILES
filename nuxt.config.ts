// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@nuxtjs/i18n', 'nuxt-auth-utils', '@nuxt/fonts', '@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  // Polices de la charte, téléchargées au build et servies depuis notre domaine
  // (/_fonts, cache immuable). Remplace la feuille de style Google Fonts qui
  // bloquait le premier rendu — et que la CSP (`font-src 'self'`) bloquait de
  // toute façon en production.
  fonts: {
    families: [
      { name: 'DM Serif Display', weights: [400], styles: ['normal', 'italic'] },
      { name: 'DM Sans', weights: [400, 500, 600, 700] },
      { name: 'Space Grotesk', weights: [500, 600] },
      // Banque de logos (admin, canvas) : deux serifs « haut de gamme ». Injectées
      // globalement car aucune règle CSS ne les référence.
      { name: 'Cormorant Garamond', weights: [600], styles: ['normal', 'italic'], global: true },
      { name: 'Cinzel', weights: [600], global: true },
    ],
  },

  // Cache/rendu par route. Objectif : ne payer le duo lambda + SQL que
  // lorsqu'il apporte quelque chose.
  routeRules: {
    // Landing quasi statique : servie depuis le cache CDN, régénérée au plus
    // toutes les heures en arrière-plan (invalidé à chaque déploiement).
    '/': { swr: 3600 },
    // Pages publiques chauffeur /{slug} : cache CDN court + régénération en
    // arrière-plan, aligné sur le s-maxage de /api/public/[slug]. Les visites
    // suivantes ne repaient ni le démarrage serverless ni les requêtes SQL.
    '/*': { swr: 60 },
    // Cartes de visite publiques /carte/{slug} : même politique que les pages
    // chauffeur — cache CDN court + régénération en arrière-plan, aligné sur le
    // s-maxage de /api/public/carte/[slug]. (Non couvert par '/*', qui ne matche
    // qu'un seul segment.)
    '/carte/**': { swr: 60 },
    // Back-office : rendu client uniquement (SPA). Le shell HTML statique
    // arrive instantanément du CDN, les données étaient déjà chargées côté
    // client — et plus aucune invocation lambda pour le HTML. Pas d'enjeu SEO
    // derrière un login. (swr désactivé explicitement : hérité de '/*' sinon.)
    '/dashboard': { ssr: false, swr: false },
    '/dashboard/**': { ssr: false },
    '/admin': { ssr: false, swr: false },
    '/admin/**': { ssr: false },
    // Parcours de configuration guidée (session chauffeur) : même politique.
    '/configuration': { ssr: false, swr: false },
    '/configuration/**': { ssr: false },
    // Service worker + manifeste PWA : revalidés à chaque chargement, sinon une
    // nouvelle version de l'app pourrait traîner derrière un cache.
    '/sw.js': { swr: false, headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },
    '/manifest.webmanifest': {
      swr: false,
      headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=0, must-revalidate' },
    },
    '/push-sw.js': { swr: false, headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  i18n: {
    locales: [
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    defaultLocale: 'fr',
    strategy: 'no_prefix',
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root',
    },
    bundle: { optimizeTranslationDirective: false },
  },

  // Configuration runtime. Les valeurs sensibles ne sont JAMAIS exposées au client :
  // seules celles sous `public` le sont.
  // Les valeurs sont lues depuis les variables d'environnement (fichier .env en local,
  // réglages du projet sur Vercel). On les câble explicitement pour accepter des noms
  // simples (DATABASE_URL, STRIPE_SECRET_KEY…) sans préfixe NUXT_.
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || '',
    // Session scellée (nuxt-auth-utils). Sans `maxAge`, le cookie serait un cookie
    // de session navigateur, supprimé à sa fermeture → reconnexion à chaque visite.
    // Le cookie n'est `Secure` qu'en production :
    // en local (http://localhost), `Secure` empêcherait les navigateurs (Safari) de le stocker.
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
      maxAge: 60 * 60 * 24 * 30, // 30 jours
      cookie: {
        secure: process.env.NODE_ENV === 'production',
      },
    },
    linkTokenSecret: process.env.LINK_TOKEN_SECRET || '',
    // Stripe
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripeConnectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '',
    // SumUp (OAuth + Hosted Checkout). redirectUri doit matcher exactement une
    // « Authorized redirect URL » déclarée sur l'app OAuth SumUp.
    sumupClientId: process.env.SUMUP_CLIENT_ID || '',
    sumupClientSecret: process.env.SUMUP_CLIENT_SECRET || '',
    sumupRedirectUri:
      process.env.SUMUP_REDIRECT_URI ||
      `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/payments/sumup/callback`,
    sumupWebhookSecret: process.env.SUMUP_WEBHOOK_SECRET || '',
    // Clé de chiffrement des jetons OAuth chauffeurs (AES-256-GCM).
    sumupTokenEncryptionKey: process.env.SUMUP_TOKEN_ENCRYPTION_KEY || '',
    // Google Maps (serveur uniquement — proxifié)
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    // Resend
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'Réservation VTC <onboarding@resend.dev>',
    // Destinataire des designs de cartes NFC validés par l'admin (production).
    nfcCardOrderEmail: process.env.NFC_CARD_ORDER_EMAIL || 'paul@myfrank.io',
    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    // Username du bot (sans @) — sert à construire le lien d'appairage t.me/<bot>?start=…
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    // INSEE Sirene
    inseeApiKey: process.env.INSEE_API_KEY || '',
    // Secret du déclencheur de tâches planifiées (rappels J-1)
    cronSecret: process.env.CRON_SECRET || '',
    // Notifications push (PWA) : clés VAPID. Générer une fois avec
    // `npx web-push generate-vapid-keys`. Sans clés, les push sont journalisés.
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    // Contact déclaré aux services push (mailto: ou https:).
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:contact@ridewiz.fr',
    public: {
      appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
      // Email de contact/support affiché dans certains messages (ex: « ce n'était
      // pas vous ? » après un changement de mot de passe). Facultatif.
      supportEmail: process.env.SUPPORT_EMAIL || '',
      // Bouton « Connecter avec SumUp » (OAuth) dans les réglages chauffeur.
      // Laisser désactivé tant que SumUp n'a pas accordé le scope restreint
      // `payments` à l'app — les chauffeurs se connectent alors par clé API.
      sumupOauthEnabled: process.env.SUMUP_OAUTH_ENABLED === '1',
      // Clé client du CDN d'images de véhicules (imagin.studio). Par défaut : clé démo
      // gratuite. Remplacer par votre propre clé pour la production (sans changer le code).
      imaginCustomer: process.env.IMAGIN_CUSTOMER || 'hrjavascript-mastery',
      // Clé publique VAPID : le navigateur s'en sert pour s'abonner aux push.
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    },
  },

  nitro: {
    // Le webhook Stripe a besoin du corps brut pour vérifier la signature.
    // Géré au niveau du handler via readRawBody.
  },

  // PWA — l'espace chauffeur s'installe sur l'écran d'accueil (Android : invite
  // native, iOS : Partager → « Sur l'écran d'accueil »), sans store. Le manifeste
  // n'est lié que par le layout dashboard et le service worker n'est enregistré
  // que sur /dashboard (plugins/pwa.client.ts) : la page publique d'un chauffeur
  // reste un site classique pour ses clients. Icônes générées depuis favicon.svg.
  pwa: {
    // Nouvelle version = bandeau « Actualiser » (PwaUpdateBanner), jamais de
    // rechargement automatique en pleine saisie.
    registerType: 'prompt',
    // Enregistrement maison (plugins/pwa.client.ts), limité au dashboard.
    client: { registerPlugin: false },
    manifest: {
      id: '/dashboard',
      name: 'Ridewiz',
      short_name: 'Ridewiz',
      description: 'Votre espace chauffeur : demandes, courses, agenda.',
      lang: 'fr',
      // Périmètre = espace chauffeur. Hors périmètre (sa page publique, ouverte
      // depuis l'app), le système affiche une vue navigateur avec bouton de
      // fermeture — sinon, sur iOS, le chauffeur y resterait coincé sans
      // bouton « précédent ».
      scope: '/dashboard',
      start_url: '/dashboard',
      display: 'standalone',
      background_color: '#FBF7F0',
      theme_color: '#0E1B2C',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Précache : le build hashé (JS/CSS) et les icônes. Jamais /api/** ni le
      // HTML (rendu serveur, données propres à chaque chauffeur) : rien de
      // personnel n'est mis en cache, l'isolation entre chauffeurs reste
      // entièrement côté serveur. Pas les polices non plus : découpées par
      // unicode-range, le navigateur ne charge que les sous-ensembles utiles et
      // les garde en cache HTTP immuable — les précacher toutes coûterait des Mo
      // pour rien.
      globPatterns: [
        '_nuxt/**/*.{js,css}',
        'pwa-*.png',
        'maskable-icon-*.png',
        'favicon*',
        'apple-touch-icon.png',
      ],
      // Un seul fichier sw.js (pas de workbox-*.js à côté).
      inlineWorkboxRuntime: true,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      // Gestionnaires push (affichage, tap, renouvellement d'abonnement) :
      // fichier statique importé par le service worker généré.
      importScripts: ['push-sw.js'],
    },
    devOptions: { enabled: false },
  },

  hooks: {
    // Le module impose un `navigateFallback: '/'` pensé pour les sites statiques.
    // En SSR, aucun `/` n'est précaché : le service worker refuserait de
    // s'installer. On retire l'option — les navigations vont toujours au réseau.
    'pwa:beforeBuildServiceWorker'(options) {
      delete options.workbox.navigateFallback
    },
  },

  app: {
    head: {
      title: 'Ridewiz — Réservation VTC',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        // viewport-fit=cover : requis pour que env(safe-area-inset-*) fonctionne sur iPhone.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'Ridewiz — Réservez votre chauffeur VTC privé : devis instantané, paiement sécurisé, créneau garanti.',
        },
        { name: 'theme-color', content: '#0E1B2C' },
        // Nom de l'icône quand une page est ajoutée à l'écran d'accueil, quelle
        // que soit la page (accueil, connexion, page publique d'un chauffeur…) :
        // toujours « Ridewiz ». Sans ces balises, Safari (iOS) et Chrome
        // (Android, hors manifeste) reprennent le <title> complet de la page.
        { name: 'apple-mobile-web-app-title', content: 'Ridewiz' },
        { name: 'application-name', content: 'Ridewiz' },
      ],
      // Favicon Ridewiz (picto « itinéraire », variante fond nuit de la charte).
      // Les typographies de la charte sont auto-hébergées via @nuxt/fonts.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
