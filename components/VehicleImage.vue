<script setup lang="ts">
// Affiche l'image d'un véhicule avec trois niveaux de priorité :
//  1. photo personnelle du chauffeur (photoUrl) quand elle existe ;
//  2. photo du modèle via le CDN imagin.studio ;
//  3. illustration locale par catégorie si tout échoue.
import { buildVehicleImageUrl, vehicleClassFallback } from '~/lib/vehicle-image'

const props = defineProps<{
  make: string
  modelFamily: string
  color?: string | null
  vehicleClass?: string | null
  alt?: string
  // Photo personnelle (URL servie par /api/public/…/vehicles/…/photo).
  photoUrl?: string | null
}>()

const config = useRuntimeConfig()
const photoFailed = ref(false)
const failed = ref(false)
const loaded = ref(false)
const fallback = computed(() => vehicleClassFallback(props.vehicleClass))

// La photo perso est cadrée en couverture (vraie photo) ; les visuels CDN et
// les illustrations sont détourés → object-contain.
const usesPhoto = computed(() => Boolean(props.photoUrl) && !photoFailed.value)

const src = computed(() => {
  if (props.photoUrl && !photoFailed.value) return props.photoUrl
  return failed.value
    ? fallback.value
    : buildVehicleImageUrl({
        make: props.make,
        modelFamily: props.modelFamily,
        color: props.color,
        customer: config.public.imaginCustomer as string,
      })
})

function onError() {
  if (usesPhoto.value) photoFailed.value = true
  else failed.value = true
}

watch(
  () => [props.make, props.modelFamily, props.color, props.photoUrl],
  () => {
    failed.value = false
    photoFailed.value = false
  },
)

// Sur une page rendue côté serveur, l'échec du chargement peut survenir AVANT
// l'hydratation : l'événement error est alors perdu et le repli ne s'active
// jamais. On rattrape ce cas au montage en inspectant l'état réel de l'image.
const imgEl = ref<HTMLImageElement | null>(null)
onMounted(() => {
  const el = imgEl.value
  if (!el || !el.complete) return
  if (el.naturalWidth === 0) onError()
  else loaded.value = true
})
</script>

<template>
  <!-- opacity-0 tant que rien n'est chargé : évite le flash « image cassée » +
       texte alt qui déborde pendant la latence (ou l'échec) du chargement. -->
  <img
    ref="imgEl"
    :src="src"
    :alt="alt || modelFamily"
    loading="lazy"
    class="h-full w-full transition-opacity duration-200"
    :class="[loaded ? 'opacity-100' : 'opacity-0', usesPhoto ? 'rounded-lg object-cover' : 'object-contain']"
    @load="loaded = true"
    @error="onError"
  />
</template>
