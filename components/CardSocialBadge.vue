<script setup lang="ts">
// Pastille d'un réseau social : fond à la couleur de la marque, glyphe blanc.
// Les logos de marque ne sont pas reproduits — un système de pastilles cohérent
// vaut mieux qu'une approximation de logo. Les formes simples et non ambiguës
// (Instagram, X, YouTube, site web) sont dessinées ; les autres portent leur
// monogramme.
const props = defineProps<{ network: string; size?: number }>()

const BRAND: Record<string, { color: string; mark: string }> = {
  instagram: { color: '#C13584', mark: 'glyph' },
  facebook: { color: '#1877F2', mark: 'f' },
  linkedin: { color: '#0A66C2', mark: 'in' },
  tiktok: { color: '#111111', mark: 'glyph' },
  youtube: { color: '#FF0000', mark: 'glyph' },
  x: { color: '#111111', mark: 'glyph' },
  snapchat: { color: '#F7C600', mark: 'S' },
  website: { color: '#5B6879', mark: 'glyph' },
}

const brand = computed(() => BRAND[props.network] ?? { color: '#5B6879', mark: 'glyph' })
const px = computed(() => props.size ?? 40)
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full text-white"
    :style="{ width: `${px}px`, height: `${px}px`, backgroundColor: brand.color }"
  >
    <!-- Instagram : carré arrondi + objectif + témoin -->
    <svg v-if="network === 'instagram'" :width="px * 0.55" :height="px * 0.55" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
    <!-- YouTube : écran + lecture -->
    <svg v-else-if="network === 'youtube'" :width="px * 0.6" :height="px * 0.6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10.5 9.2l4.6 2.8-4.6 2.8V9.2z" fill="currentColor" stroke="none" />
    </svg>
    <!-- X : deux traits croisés -->
    <svg v-else-if="network === 'x'" :width="px * 0.45" :height="px * 0.45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </svg>
    <!-- TikTok : note de musique -->
    <svg v-else-if="network === 'tiktok'" :width="px * 0.5" :height="px * 0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M12 15V4c1.2 2.2 2.9 3.2 5 3.3" />
    </svg>
    <!-- Site web : globe -->
    <svg v-else-if="network === 'website'" :width="px * 0.55" :height="px * 0.55" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
    <!-- Monogramme pour les marques dont le logo n'est pas reproductible proprement -->
    <span
      v-else
      class="font-semibold leading-none"
      :style="{ fontSize: `${Math.round(px * (brand.mark.length > 1 ? 0.34 : 0.46))}px` }"
    >{{ brand.mark }}</span>
  </span>
</template>
