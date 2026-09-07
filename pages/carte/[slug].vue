<script setup lang="ts">
// Carte de visite publique d'un chauffeur : /carte/{slug}.
//
// Surface d'acquisition amont (QR sur le véhicule, réseaux, rencontre) qui
// alimente la page de réservation — elle ne s'y substitue pas. Rendue côté
// serveur pour le SEO et pour les aperçus de partage (WhatsApp, LinkedIn…).
import type { CardView } from '~/lib/card-view'

const route = useRoute()
const slug = route.params.slug as string
const { t } = useI18n()
const { appBaseUrl } = useRuntimeConfig().public

const { data: card, error } = await useFetch<CardView>(`/api/public/carte/${slug}`)
if (error.value || !card.value) {
  throw createError({ statusCode: 404, statusMessage: t('card.notFound'), fatal: true })
}

// Les URL d'images sont relatives ; les métadonnées de partage en exigent des absolues.
const shareImage = computed(() => {
  const rel = card.value?.coverUrl ?? card.value?.avatarUrl
  return rel ? `${appBaseUrl}${rel}` : null
})

useHead(() => {
  const c = card.value
  if (!c) return {}
  const title = t('card.metaTitle', { name: c.displayName })
  const description = c.headline || t('card.metaDescription', { name: c.displayName })
  return {
    title,
    meta: [
      { name: 'description', content: description },
      { property: 'og:type', content: 'profile' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: `${appBaseUrl}/carte/${c.slug}` },
      ...(shareImage.value ? [{ property: 'og:image', content: shareImage.value }] : []),
      { name: 'twitter:card', content: shareImage.value ? 'summary_large_image' : 'summary' },
    ],
    link: [{ rel: 'canonical', href: `${appBaseUrl}/carte/${c.slug}` }],
  }
})
</script>

<template>
  <CardRender v-if="card" :card="card" class="min-h-screen" />
</template>
