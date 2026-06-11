<script setup lang="ts">
defineProps<{ title: string; value: string | number }>()
</script>

<template>
  <div class="card !p-4">
    <p class="text-xs text-slate-500">{{ title }}</p>
    <p class="mt-1 text-xl font-bold text-slate-900">{{ value }}</p>
  </div>
</template>
