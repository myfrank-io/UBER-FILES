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
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="emit('close')"
    >
      <div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <slot />
      </div>
    </div>
  </Teleport>
</template>
