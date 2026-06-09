<script setup lang="ts">
// En-tête de navigation partagé entre toutes les pages.
defineProps<{
  navigation: { name: string; to: string }[]
}>()
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <NuxtLink to="/" class="flex items-center gap-2">
        <span
          class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white"
        >
          U
        </span>
        <span class="text-lg font-bold tracking-tight text-slate-900">UBER FILES</span>
      </NuxtLink>

      <nav class="flex items-center gap-1">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          active-class="!text-brand-600"
        >
          {{ item.name }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
