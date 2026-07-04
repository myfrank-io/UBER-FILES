<script setup lang="ts">
// Affiche la photo d'un modèle via le CDN imagin.studio, avec repli automatique
// sur une illustration locale par catégorie si l'image n'est pas disponible.
import { buildVehicleImageUrl, vehicleClassFallback } from '~/lib/vehicle-image'

const props = defineProps<{
  make: string
  modelFamily: string
  color?: string | null
  vehicleClass?: string | null
  alt?: string
}>()

const config = useRuntimeConfig()
const failed = ref(false)
const loaded = ref(false)
const fallback = computed(() => vehicleClassFallback(props.vehicleClass))

const src = computed(() =>
  failed.value
    ? fallback.value
    : buildVehicleImageUrl({
        make: props.make,
        modelFamily: props.modelFamily,
        color: props.color,
        customer: config.public.imaginCustomer as string,
      }),
)

watch(
  () => [props.make, props.modelFamily, props.color],
  () => (failed.value = false),
)

// Sur une page rendue côté serveur, l'échec du CDN peut survenir AVANT l'hydratation :
// l'événement error est alors perdu et le repli local ne s'active jamais. On rattrape
// ce cas au montage en inspectant l'état réel de l'image.
const imgEl = ref<HTMLImageElement | null>(null)
onMounted(() => {
  const el = imgEl.value
  if (!el || !el.complete) return
  if (el.naturalWidth === 0) failed.value = true
  else loaded.value = true
})
</script>

<template>
  <!-- opacity-0 tant que rien n'est chargé : évite le flash « image cassée » +
       texte alt qui déborde pendant la latence (ou l'échec) du CDN. -->
  <img
    ref="imgEl"
    :src="src"
    :alt="alt || modelFamily"
    loading="lazy"
    class="h-full w-full object-contain transition-opacity duration-200"
    :class="loaded ? 'opacity-100' : 'opacity-0'"
    @load="loaded = true"
    @error="failed = true"
  />
</template>
