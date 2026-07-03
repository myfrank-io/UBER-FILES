<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; statusMessage?: string; message?: string } }>()

const is404 = computed(() => props.error.statusCode === 404)
const title = computed(() => is404.value ? 'Page introuvable' : 'Une erreur est survenue')
const message = computed(() =>
  is404.value
    ? 'La page que vous cherchez n\'existe pas ou a été déplacée.'
    : props.error.statusMessage || props.error.message || 'Une erreur inattendue s\'est produite.',
)

useHead({ title: () => `${props.error.statusCode} — ${title.value}` })

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-5 text-center">
    <p class="text-6xl font-extrabold text-brand-600">{{ error.statusCode }}</p>
    <h1 class="mt-4 font-serif text-2xl font-medium tracking-tight text-slate-900">{{ title }}</h1>
    <p class="mt-3 max-w-sm text-slate-600">{{ message }}</p>
    <button class="btn-primary mt-8" @click="goHome">Retour à l'accueil</button>
  </div>
</template>
