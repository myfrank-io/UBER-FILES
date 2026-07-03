// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', '@nuxtjs/i18n', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

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
    // Session scellée (nuxt-auth-utils). Le cookie n'est `Secure` qu'en production :
    // en local (http://localhost), `Secure` empêcherait les navigateurs (Safari) de le stocker.
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
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
    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    // Notifications sortantes Telegram coupées par défaut : tout passe par email.
    // Remettre TELEGRAM_NOTIFICATIONS_ENABLED=1 pour les réactiver (le webhook
    // et la liaison de compte restent actifs dans tous les cas).
    telegramNotificationsEnabled: ['1', 'true'].includes(
      process.env.TELEGRAM_NOTIFICATIONS_ENABLED || '',
    ),
    // INSEE Sirene
    inseeApiKey: process.env.INSEE_API_KEY || '',
    // Secret du déclencheur de tâches planifiées (rappels J-1)
    cronSecret: process.env.CRON_SECRET || '',
    public: {
      appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
      // Bouton « Connecter avec SumUp » (OAuth) dans les réglages chauffeur.
      // Laisser désactivé tant que SumUp n'a pas accordé le scope restreint
      // `payments` à l'app — les chauffeurs se connectent alors par clé API.
      sumupOauthEnabled: process.env.SUMUP_OAUTH_ENABLED === '1',
      // Clé client du CDN d'images de véhicules (imagin.studio). Par défaut : clé démo
      // gratuite. Remplacer par votre propre clé pour la production (sans changer le code).
      imaginCustomer: process.env.IMAGIN_CUSTOMER || 'hrjavascript-mastery',
      // Outils de développement (commutateur admin/chauffeur/public).
      // Actifs automatiquement en local ; en ligne uniquement si DEV_TOOLS=1.
      // À RETIRER avant la mise en production finale.
      devTools: process.env.NODE_ENV === 'development' || process.env.DEV_TOOLS === '1',
    },
  },

  nitro: {
    // Le webhook Stripe a besoin du corps brut pour vérifier la signature.
    // Géré au niveau du handler via readRawBody.
  },

  app: {
    head: {
      title: 'Réservation VTC',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Réservez votre chauffeur VTC privé : devis instantané, paiement sécurisé, créneau garanti.',
        },
      ],
      // Favicon Ridewiz (picto « itinéraire », variante fond nuit de la charte).
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
