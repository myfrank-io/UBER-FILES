<script setup lang="ts">
// Invitation à ajouter Ridewiz à l'écran d'accueil, sur l'accueil du dashboard.
//
// Même principe que DashboardCardPromo : une seule sollicitation à la fois sur
// cet écran. Elle prend le relais une fois la carte de visite publiée (la promo
// carte a alors disparu) et le profil validé — uniquement sur mobile, et elle
// se tait 30 jours quand le chauffeur la ferme. Le mode d'emploi complet reste
// toujours accessible dans Réglages › Général (DashboardInstallCard).
const { data: me } = await useMe()
const { promptVisible, isIos, install, snooze } = usePwaInstall()

const eligible = computed(() => {
  const m = me.value as { status?: string; card?: { published?: boolean } } | null
  return m?.status === 'ACTIVE' && Boolean(m.card?.published)
})
const visible = computed(() => eligible.value && promptVisible.value)

// iOS : pas d'invite native, le bouton déplie le mode d'emploi.
const stepsOpen = ref(false)

async function onInstall() {
  if (isIos.value) {
    stepsOpen.value = !stepsOpen.value
    return
  }
  // Invite native refusée : on n'insiste pas avant 30 jours.
  if ((await install()) === 'dismissed') snooze()
}
</script>

<template>
  <div v-if="visible" class="card border-brand-100 bg-gradient-to-br from-brand-50/70 to-white !p-4">
    <div class="flex items-start gap-3">
      <span class="text-2xl" aria-hidden="true">📲</span>
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold text-slate-900">Ajoutez Ridewiz à votre écran d'accueil</h2>
        <p class="mt-0.5 text-[13px] leading-snug text-slate-600">
          Votre espace s'ouvre en un tap, en plein écran, comme une application.
        </p>
        <PwaInstallSteps v-if="isIos && stepsOpen" class="mt-3" />
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-primary !min-h-[40px] !px-4 !py-2 text-sm" @click="onInstall">
            {{ isIos ? (stepsOpen ? 'Masquer' : 'Voir comment faire') : 'Installer' }}
          </button>
          <button type="button" class="btn-ghost !min-h-[40px] !px-4 !py-2 text-sm" @click="snooze">
            Plus tard
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
