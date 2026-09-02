<script setup lang="ts">
// Barre d'actions commune : Retour / (Passer) / Continuer. Le message d'erreur
// de l'étape s'affiche juste au-dessus, toujours au même endroit.
const props = withDefaults(
  defineProps<{
    nextLabel?: string
    busy?: boolean
    disabled?: boolean
    /** Étape optionnelle : bouton « Passer » qui avance sans enregistrer. */
    skippable?: boolean
    skipLabel?: string
    error?: string
    /** Masque « Continuer » (étape qui avance d'elle-même, ex. déjà connecté). */
    hideNext?: boolean
  }>(),
  { nextLabel: 'Continuer', skipLabel: 'Plus tard', busy: false, disabled: false, skippable: false, error: '', hideNext: false },
)
const emit = defineEmits<{ next: []; skip: [] }>()
const { back, goTo, current, result } = useSetupFlow()
const canGoBack = computed(() => current.value !== 'intro' && Boolean(result.value))
void props
</script>

<template>
  <div>
    <p v-if="error" class="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">{{ error }}</p>
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div v-if="canGoBack" class="flex items-center gap-2">
        <button type="button" class="btn-ghost sm:min-w-[120px]" :disabled="busy" @click="back">← Retour</button>
        <button
          type="button"
          class="min-h-[44px] rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          :disabled="busy"
          title="Revenir au sommaire des étapes"
          @click="goTo('intro')"
        >☰ Sommaire</button>
      </div>
      <span v-else />
      <div class="flex flex-col gap-2 sm:flex-row">
        <button v-if="skippable" type="button" class="btn-ghost" :disabled="busy" data-testid="setup-skip" @click="emit('skip')">{{ skipLabel }}</button>
        <button
          v-if="!hideNext"
          type="button"
          class="btn-primary sm:min-w-[180px]"
          :disabled="busy || disabled"
          data-testid="setup-next"
          @click="emit('next')"
        >{{ busy ? 'Enregistrement…' : nextLabel }}</button>
      </div>
    </div>
  </div>
</template>
