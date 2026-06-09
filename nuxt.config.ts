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
  runtimeConfig: {
    databaseUrl: '',
    sessionPassword: '',
    // Session scellée (nuxt-auth-utils). Le cookie n'est `Secure` qu'en production :
    // en local (http://localhost), `Secure` empêcherait les navigateurs (Safari) de le stocker.
    session: {
      password: '',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
      },
    },
    appBaseUrl: 'http://localhost:3000',
    linkTokenSecret: '',
    // Stripe
    stripeSecretKey: '',
    stripeWebhookSecret: '',
    stripeConnectWebhookSecret: '',
    // Google Maps (serveur uniquement — proxifié)
    googleMapsApiKey: '',
    // Resend
    resendApiKey: '',
    emailFrom: 'Réservation VTC <onboarding@resend.dev>',
    // Telegram
    telegramBotToken: '',
    telegramWebhookSecret: '',
    // INSEE Sirene
    inseeApiKey: '',
    // Secret du déclencheur de tâches planifiées (rappels J-1)
    cronSecret: '',
    public: {
      appBaseUrl: 'http://localhost:3000',
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
    },
  },
})
