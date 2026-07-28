<script setup lang="ts">
// Sélecteur de terminal/hall, affiché uniquement quand l'adresse correspond à un hub
// connu (aéroport/gare) du catalogue lib/hubs.ts. Au choix d'un terminal, on remonte
// au parent son code ET ses coordonnées de prise en charge VTC, qui priment alors sur
// les coordonnées génériques du lieu.
// `arrival` adapte les libellés au bout « arrivée » du trajet (dépose, pas prise en charge).
import { findHubByText, findTerminal } from '~/lib/hubs'

const props = withDefaults(
  defineProps<{ address: string; modelValue: string | null; arrival?: boolean }>(),
  { arrival: false },
)
const emit = defineEmits<{
  'update:modelValue': [string | null]
  coords: [{ lat: number; lng: number } | null]
}>()

const { t } = useI18n()

const hub = computed(() => findHubByText(props.address))
const isAirport = computed(() => hub.value?.kind === 'AIRPORT')

const label = computed(() =>
  isAirport.value ? t('public.terminalLabel') : t('public.terminalHallLabel'),
)
const placeholder = computed(() =>
  isAirport.value ? t('public.terminalChoose') : t('public.terminalChooseHall'),
)
const hint = computed(() => {
  if (props.arrival) {
    return isAirport.value ? t('public.terminalHintDropoff') : t('public.terminalHintDropoffHall')
  }
  return isAirport.value ? t('public.terminalHintPickup') : t('public.terminalHintPickupHall')
})

// Quand le hub change (nouvelle adresse) : on réinitialise la sélection.
watch(hub, () => {
  emit('update:modelValue', null)
  emit('coords', null)
})

function onSelect(code: string) {
  emit('update:modelValue', code || null)
  const h = hub.value
  const terminal = h ? findTerminal(h, code) : null
  emit('coords', terminal ? { lat: terminal.lat, lng: terminal.lng } : null)
}
</script>

<template>
  <div v-if="hub">
    <label class="label" :for="`terminal-${hub.id}-${arrival ? 'to' : 'from'}`">
      {{ label }}
      <span class="font-normal text-slate-400">{{ $t('public.airportOptional') }}</span>
    </label>
    <select
      :id="`terminal-${hub.id}-${arrival ? 'to' : 'from'}`"
      :value="modelValue ?? ''"
      class="field"
      @change="onSelect(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ placeholder }}</option>
      <option v-for="term in hub.terminals" :key="term.code" :value="term.code">{{ term.label }}</option>
    </select>
    <p class="mt-1 text-xs text-slate-500">{{ hint }}</p>
  </div>
</template>
