<script setup lang="ts">
// Sélecteur de langue FR/EN pour les pages client. Le choix est persisté via le
// cookie i18n (detectBrowserLanguage.useCookie), donc conservé d'une visite à l'autre.
const { locale, setLocale } = useI18n()
</script>

<template>
  <div class="fixed right-3 top-3 z-40 flex overflow-hidden rounded-full border border-slate-200 bg-white/90 text-xs font-semibold shadow-sm backdrop-blur">
    <button
      type="button"
      class="px-3 py-1.5 transition"
      :class="locale === 'fr' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'"
      :aria-pressed="locale === 'fr'"
      @click="setLocale('fr')"
    >
      FR
    </button>
    <button
      type="button"
      class="px-3 py-1.5 transition"
      :class="locale === 'en' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800'"
      :aria-pressed="locale === 'en'"
      @click="setLocale('en')"
    >
      EN
    </button>
  </div>
</template>
