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
    // Username du bot (sans @) — sert à construire le lien d'appairage t.me/<bot>?start=…
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    // INSEE Sirene
    inseeApiKey: process.env.INSEE_API_KEY || '',
    // Secret du déclencheur de tâches planifiées (rappels J-1)
    cronSecret: process.env.CRON_SECRET || '',
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
    },
  },

  nitro: {
    // Le webhook Stripe a besoin du corps brut pour vérifier la signature.
    // Géré au niveau du handler via readRawBody.
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
      ],
      // Favicon Ridewiz (picto « itinéraire », variante fond nuit de la charte)
      // + typographies de la charte (DM Serif Display, DM Sans, Space Grotesk).
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@500;600&display=swap',
        },
      ],
    },
  },
})
