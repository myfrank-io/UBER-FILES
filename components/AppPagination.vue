<script setup lang="ts">
const props = defineProps<{ page: number; pages: number }>()
const emit = defineEmits<{ change: [page: number] }>()
</script>

<template>
  <div v-if="pages > 1" class="flex items-center justify-center gap-3">
    <button
      class="btn-ghost !py-2 text-sm"
      :disabled="page === 1"
      @click="emit('change', page - 1)"
    >
      ← Précédent
    </button>
    <span class="text-sm text-slate-500">{{ page }} / {{ pages }}</span>
    <button
      class="btn-ghost !py-2 text-sm"
      :disabled="page === pages"
      @click="emit('change', page + 1)"
    >
      Suivant →
    </button>
  </div>
</template>
