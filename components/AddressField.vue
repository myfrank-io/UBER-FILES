<script setup lang="ts">
// Champ d'adresse avec autocomplétion (proxy serveur Google Places / repli BAN).
// À la sélection d'une suggestion, on résout ses coordonnées EXACTES (placeId →
// Place Details) et on les remonte au parent via `resolve`, pour une précision
// « au bon terminal / bonne entrée » plutôt qu'un re-géocodage du texte.
type Suggestion = { description: string; placeId: string; lat?: number; lng?: number }

defineProps<{ modelValue: string; placeholder?: string; id?: string }>()
const emit = defineEmits<{
  'update:modelValue': [string]
  // Coordonnées résolues du lieu choisi, ou null si l'utilisateur tape librement
  // (le parent retombe alors sur un géocodage du texte à l'envoi).
  resolve: [{ lat: number; lng: number } | null]
}>()

const suggestions = ref<Suggestion[]>([])
const open = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function onInput(value: string) {
  emit('update:modelValue', value)
  // Toute frappe invalide la résolution précédente : l'adresse a changé.
  emit('resolve', null)
  if (timer) clearTimeout(timer)
  if (value.trim().length < 3) {
    suggestions.value = []
    return
  }
  timer = setTimeout(async () => {
    try {
      const res = await $fetch<{ predictions: Suggestion[] }>('/api/public/autocomplete', {
        method: 'POST',
        body: { input: value },
      })
      suggestions.value = res.predictions
      open.value = res.predictions.length > 0
    } catch {
      suggestions.value = []
    }
  }, 250)
}

async function pick(s: Suggestion) {
  emit('update:modelValue', s.description)
  suggestions.value = []
  open.value = false

  // Coordonnées déjà connues (BAN) : on les remonte directement.
  if (typeof s.lat === 'number' && typeof s.lng === 'number') {
    emit('resolve', { lat: s.lat, lng: s.lng })
    return
  }
  // Sinon (Google) : on résout le placeId en coordonnées exactes.
  try {
    const coords = await $fetch<{ lat: number; lng: number }>('/api/public/place-details', {
      method: 'POST',
      body: { placeId: s.placeId },
    })
    emit('resolve', coords)
  } catch {
    // Échec de résolution : le parent géocodera le texte à l'envoi (repli).
    emit('resolve', null)
  }
}
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      :value="modelValue"
      type="text"
      class="field"
      :placeholder="placeholder"
      autocomplete="off"
      @input="onInput(($event.target as HTMLInputElement).value)"
      @focus="open = suggestions.length > 0"
      @blur="() => setTimeout(() => (open = false), 150)"
    />
    <ul
      v-if="open"
      class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
    >
      <li
        v-for="s in suggestions"
        :key="s.placeId"
        class="cursor-pointer px-4 py-2.5 text-sm hover:bg-brand-50"
        @mousedown.prevent="pick(s)"
      >
        {{ s.description }}
      </li>
    </ul>
  </div>
</template>
