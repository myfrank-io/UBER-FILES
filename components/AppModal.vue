<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

onMounted(() => {
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <!-- pb safe-area : le contenu de la modale ne tombe pas sous l'indicateur home iPhone. -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      @click.self="emit('close')"
    >
      <div class="card max-h-[90vh] w-full max-w-lg overflow-y-auto !p-5 sm:!p-6">
        <slot />
      </div>
    </div>
  </Teleport>
</template>
