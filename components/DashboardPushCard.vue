<script setup lang="ts">
// Réglages › Général : « Notifications de l'application ». Activation des
// notifications push de la PWA sur cet appareil — nouvelle demande, course
// confirmée, report, annulation, rappel. Complète Telegram sans le remplacer.
const { configured, state, busy, error, enable, disable, sendTest } = usePushNotifications()
const { success: toastSuccess, error: toastError } = useToast()

async function onEnable() {
  if (await enable()) toastSuccess('Notifications activées sur cet appareil.')
}

async function onTest() {
  try {
    const sent = await sendTest()
    if (sent > 0) toastSuccess(`Notification de test envoyée (${sent} appareil${sent > 1 ? 's' : ''}).`)
    else toastError("Aucun appareil n'a pu être joint. Réactivez les notifications puis réessayez.")
  } catch {
    toastError("L'envoi du test a échoué.")
  }
}
</script>

<template>
  <div id="notifications" class="card">
    <h2 class="font-semibold text-slate-900">Notifications de l'application</h2>
    <p class="mt-1 text-sm text-slate-600">
      Recevez sur votre téléphone chaque étape des réservations : nouvelle demande, course
      confirmée, report, annulation, rappel avant la course. Un tap ouvre la bonne page.
    </p>

    <div class="mt-3">
      <p v-if="!configured" class="text-sm text-slate-500">
        Les notifications de l'application ne sont pas encore disponibles.
      </p>
      <p v-else-if="state === 'needs-install'" class="text-sm text-slate-500">
        Sur iPhone, ajoutez d'abord Ridewiz à votre écran d'accueil (ci-dessus), puis ouvrez
        l'application depuis son icône pour activer les notifications.
      </p>
      <p v-else-if="state === 'unsupported'" class="text-sm text-slate-500">
        Disponibles depuis l'application sur votre téléphone (Android, ou iPhone une fois
        ajoutée à l'écran d'accueil).
      </p>
      <p v-else-if="state === 'blocked'" class="text-sm text-slate-500">
        Les notifications sont bloquées pour Ridewiz dans les réglages de votre téléphone.
        Autorisez-les, puis revenez ici.
      </p>
      <template v-else-if="state === 'on'">
        <p class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
          ✅ Activées sur cet appareil
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="btn-ghost" :disabled="busy" @click="onTest">Envoyer un test</button>
          <button type="button" class="btn-ghost" :disabled="busy" @click="disable">Désactiver</button>
        </div>
      </template>
      <template v-else>
        <button type="button" class="btn-primary" :disabled="busy" @click="onEnable">
          {{ busy ? '…' : 'Activer les notifications' }}
        </button>
      </template>
      <p v-if="error" class="mt-3 text-sm text-red-700">{{ error }}</p>
    </div>
  </div>
</template>
