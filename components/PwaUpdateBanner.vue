<script setup lang="ts">
// « Nouvelle version disponible » : une mise à jour a été déployée depuis
// l'ouverture de l'app et attend qu'on l'active (service worker en mode
// « prompt » — jamais de rechargement surprise en pleine saisie).
const { needRefresh, applyUpdate } = usePwaInstall()
const applying = ref(false)

async function refresh() {
  applying.value = true
  await applyUpdate()
}
</script>

<template>
  <div
    v-if="needRefresh"
    class="mb-4 flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 py-1 pl-3.5 pr-1 text-xs text-brand-900 sm:text-sm"
  >
    <p class="min-w-0 truncate">🔄 <strong>Nouvelle version</strong> de Ridewiz disponible</p>
    <button
      type="button"
      class="flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 font-semibold text-brand-700 hover:bg-brand-100"
      :disabled="applying"
      @click="refresh"
    >
      {{ applying ? '…' : 'Actualiser' }}
    </button>
  </div>
</template>
