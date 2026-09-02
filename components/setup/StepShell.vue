<script setup lang="ts">
// Gabarit d'un écran du parcours : titre, sous-titre, contenu, aide repliée
// (pour les étapes délicates) et barre d'actions. Le libellé « Déjà fait »
// signale qu'on revient sur une étape validée.
defineProps<{
  icon: string
  title: string
  subtitle?: string
  done?: boolean
}>()
</script>

<template>
  <section class="card !p-5 sm:!p-7">
    <div class="flex items-start gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl" aria-hidden="true">{{ icon }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="font-serif text-2xl text-slate-950">{{ title }}</h1>
          <span v-if="done" class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">✓ Déjà fait</span>
        </div>
        <p v-if="subtitle" class="mt-1 text-sm text-slate-600">{{ subtitle }}</p>
      </div>
    </div>

    <div class="mt-6 space-y-5">
      <slot />
    </div>

    <details v-if="$slots.help" class="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2 text-sm text-slate-600">
      <summary class="cursor-pointer select-none py-1.5 font-medium text-slate-800">💡 Besoin d'aide ?</summary>
      <div class="space-y-2 pb-2 pt-1">
        <slot name="help" />
      </div>
    </details>

    <div v-if="$slots.actions" class="mt-6 border-t border-slate-100 pt-5">
      <slot name="actions" />
    </div>
  </section>
</template>
