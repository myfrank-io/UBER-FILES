<script setup lang="ts">
// Adresse cliquable : ouvre la navigation GPS (Waze) vers l'adresse.
// Waze : lien universel — ouvre l'app si installée (mobile), sinon le site.
// `@click.stop` : ne déclenche pas le clic de la carte parente (détail, modale…).
const props = defineProps<{ address: string }>()

const url = computed(
  () => `https://waze.com/ul?q=${encodeURIComponent(props.address)}&navigate=yes`,
)
</script>

<template>
  <a
    :href="url"
    target="_blank"
    rel="noopener"
    class="underline decoration-slate-300 decoration-dotted underline-offset-2 transition-colors hover:text-brand-700 hover:decoration-brand-400"
    :title="`Naviguer vers « ${address} » (Waze)`"
    @click.stop
  >{{ address }}</a>
</template>
