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
</script>

<template>
  <img
    :src="src"
    :alt="alt || modelFamily"
    loading="lazy"
    class="h-full w-full object-contain"
    @error="failed = true"
  />
</template>
