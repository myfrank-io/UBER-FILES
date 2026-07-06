<script setup lang="ts">
// Sélecteur de terminal/hall, affiché uniquement quand l'adresse de prise en charge
// correspond à un hub connu (aéroport/gare) du catalogue lib/hubs.ts. Au choix d'un
// terminal, on remonte au parent son code ET ses coordonnées de prise en charge VTC,
// qui priment alors sur les coordonnées génériques du lieu.
import { findHubByText, findTerminal } from '~/lib/hubs'

const props = defineProps<{ address: string; modelValue: string | null }>()
const emit = defineEmits<{
  'update:modelValue': [string | null]
  coords: [{ lat: number; lng: number } | null]
}>()

const hub = computed(() => findHubByText(props.address))

// Quand le hub change (nouvelle adresse) : on réinitialise la sélection.
watch(hub, () => {
  emit('update:modelValue', null)
  emit('coords', null)
})

function onSelect(code: string) {
  emit('update:modelValue', code || null)
  const h = hub.value
  const t = h ? findTerminal(h, code) : null
  emit('coords', t ? { lat: t.lat, lng: t.lng } : null)
}
</script>

<template>
  <div v-if="hub">
    <label class="label" :for="`terminal-${hub.id}`">
      {{ hub.kind === 'AIRPORT' ? 'Terminal' : 'Hall / entrée' }}
    </label>
    <select
      :id="`terminal-${hub.id}`"
      :value="modelValue ?? ''"
      class="field"
      @change="onSelect(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ hub.kind === 'AIRPORT' ? 'Choisir le terminal' : 'Choisir le hall' }}</option>
      <option v-for="t in hub.terminals" :key="t.code" :value="t.code">{{ t.label }}</option>
    </select>
    <p class="mt-1 text-xs text-slate-500">
      Précisez votre {{ hub.kind === 'AIRPORT' ? 'terminal' : 'point de rendez-vous' }} pour une prise en charge au bon endroit.
    </p>
  </div>
</template>
