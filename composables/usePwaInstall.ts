// Invitation « ajouter Ridewiz à l'écran d'accueil » — côté présentation.
//
// Le plugin pwa.client.ts capte les événements navigateur ; ce composable y
// ajoute ce dont les composants ont besoin : la plateforme (Android → invite
// native, iOS → mode d'emploi), le report « Plus tard » (30 jours, localStorage)
// et la règle d'affichage finale. Tout est client : côté serveur, rien n'est
// affichable.
import type { PwaInstallApi } from '~/plugins/pwa.client'
import {
  detectInstallPlatform,
  installSnoozeUntil,
  isInstallSnoozed,
  type InstallPlatform,
} from '~/lib/pwa-install'

const SNOOZE_KEY = 'ridewiz:pwa-install-snoozed-until'

// localStorage peut lever (navigation privée Safari, stockage bloqué) : on se
// comporte alors comme si rien n'était mémorisé.
function readSnooze(): string | null {
  try {
    return localStorage.getItem(SNOOZE_KEY)
  } catch {
    return null
  }
}
function writeSnooze(value: string) {
  try {
    localStorage.setItem(SNOOZE_KEY, value)
  } catch {
    // Sans mémoire, l'invitation reviendra simplement à la prochaine visite.
  }
}

export function usePwaInstall() {
  const api = import.meta.client
    ? (useNuxtApp() as unknown as { $pwaInstall?: PwaInstallApi }).$pwaInstall
    : undefined

  const platform = ref<InstallPlatform>(
    import.meta.client ? detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints) : 'desktop',
  )
  const isIos = computed(() => platform.value === 'ios')
  const installed = computed(() => api?.installed.value ?? false)
  const canPrompt = computed(() => api?.canPrompt.value ?? false)
  const snoozed = ref(import.meta.client ? isInstallSnoozed(readSnooze(), Date.now()) : true)

  // Installable depuis ce navigateur : sur mobile, pas encore installée, et un
  // chemin connu — invite native (Chromium) ou mode d'emploi (iOS).
  const available = computed(
    () => !installed.value && platform.value !== 'desktop' && (canPrompt.value || isIos.value),
  )
  // Invitation de l'accueil : disponible et pas reportée.
  const promptVisible = computed(() => available.value && !snoozed.value)

  function snooze() {
    writeSnooze(installSnoozeUntil(Date.now()))
    snoozed.value = true
  }

  async function install() {
    return (await api?.prompt()) ?? 'unavailable'
  }

  const needRefresh = computed(() => api?.needRefresh.value ?? false)
  async function applyUpdate() {
    await api?.applyUpdate()
  }

  return { platform, isIos, installed, canPrompt, available, promptVisible, snooze, install, needRefresh, applyUpdate }
}
