<script setup lang="ts">
// Réglages › Général : « Ridewiz sur votre téléphone ». Point d'entrée permanent
// de l'installation — l'invitation de l'accueil, elle, se ferme.
const { platform, isIos, installed, canPrompt, install } = usePwaInstall()
const installing = ref(false)

async function onInstall() {
  installing.value = true
  try {
    await install()
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <div id="application" class="card">
    <h2 class="font-semibold text-slate-900">Ridewiz sur votre téléphone</h2>
    <p class="mt-1 text-sm text-slate-600">
      Ajoutez votre espace à l'écran d'accueil : il s'ouvre en un tap, en plein écran,
      comme une application — sans passer par un store. Les mises à jour sont automatiques.
    </p>

    <div class="mt-3">
      <p v-if="installed" class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
        ✅ Installée sur cet appareil
      </p>
      <p v-else-if="platform === 'desktop'" class="text-sm text-slate-500">
        Ouvrez cette page depuis votre téléphone pour installer l'application.
      </p>
      <button v-else-if="canPrompt" type="button" class="btn-primary" :disabled="installing" @click="onInstall">
        {{ installing ? '…' : "Installer l'application" }}
      </button>
      <PwaInstallSteps v-else-if="isIos" />
      <p v-else class="text-sm text-slate-500">
        Dans le menu de votre navigateur, choisissez « Installer l'application » ou
        « Ajouter à l'écran d'accueil ». Déjà installée ? Ouvrez-la depuis votre écran d'accueil.
      </p>
    </div>
  </div>
</template>
