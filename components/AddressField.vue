<script setup lang="ts">
// Champ d'adresse avec autocomplétion (proxy serveur Google Places). Si aucune clé
// n'est configurée, l'autocomplétion est vide mais la saisie libre reste géocodée à l'envoi.
const props = defineProps<{ modelValue: string; placeholder?: string; id?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const suggestions = ref<{ description: string; placeId: string }[]>([])
const open = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function onInput(value: string) {
  emit('update:modelValue', value)
  if (timer) clearTimeout(timer)
  if (value.trim().length < 3) {
    suggestions.value = []
    return
  }
  timer = setTimeout(async () => {
    try {
      const res = await $fetch<{ predictions: { description: string; placeId: string }[] }>(
        '/api/public/autocomplete',
        { method: 'POST', body: { input: value } },
      )
      suggestions.value = res.predictions
      open.value = res.predictions.length > 0
    } catch {
      suggestions.value = []
    }
  }, 250)
}

function pick(description: string) {
  emit('update:modelValue', description)
  suggestions.value = []
  open.value = false
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
        @mousedown.prevent="pick(s.description)"
      >
        {{ s.description }}
      </li>
    </ul>
  </div>
</template>
