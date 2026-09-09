// Service worker + invite d'installation (PWA) — espace chauffeur uniquement.
//
// Le module @vite-pwa/nuxt n'enregistre pas le service worker lui-même
// (client.registerPlugin désactivé dans nuxt.config) : on le fait ici, et
// seulement sur les routes /dashboard. Un passager qui ouvre la page publique
// d'un chauffeur ne doit rien télécharger en arrière-plan — le service worker
// est un outil du chauffeur, pas de ses clients.
//
// Ce plugin se limite aux événements navigateur ; la présentation (plateforme,
// report « Plus tard », règle d'affichage) vit dans usePwaInstall.
import type { Ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { isDriverAppPath } from '~/lib/pwa-install'

// Événement Chromium, non standardisé (absent des typings DOM).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaInstallApi {
  /** Chromium a émis `beforeinstallprompt` : l'invite native est disponible. */
  canPrompt: Ref<boolean>
  /** L'app tourne en plein écran (lancée depuis l'écran d'accueil). */
  installed: Ref<boolean>
  /** Une nouvelle version attend d'être activée (déployée depuis l'ouverture). */
  needRefresh: Ref<boolean>
  /** Déclenche l'invite native d'installation. */
  prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  /** Active la nouvelle version : le navigateur recharge la page. */
  applyUpdate: () => Promise<void>
}

// Une app installée reste ouverte des jours sans navigation complète : on
// vérifie nous-mêmes s'il y a une nouvelle version, au retour au premier plan
// et toutes les heures.
const UPDATE_CHECK_MS = 60 * 60 * 1000

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export default defineNuxtPlugin(() => {
  const canPrompt = ref(false)
  const installed = ref(isStandalone())
  const needRefresh = ref(false)
  let deferred: BeforeInstallPromptEvent | null = null
  let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

  // On retient l'événement au lieu de laisser Chrome afficher sa mini-barre :
  // l'invitation est la nôtre (accueil du dashboard, Réglages).
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    canPrompt.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    canPrompt.value = false
    installed.value = true
  })

  let registered = false
  function registerIfDashboard(path: string) {
    if (registered || !isDriverAppPath(path) || !('serviceWorker' in navigator)) return
    registered = true
    const sw = useRegisterSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (!registration) return
        const check = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        }
        document.addEventListener('visibilitychange', check)
        setInterval(check, UPDATE_CHECK_MS)
      },
    })
    watch(sw.needRefresh, (value) => { needRefresh.value = value }, { immediate: true })
    updateServiceWorker = sw.updateServiceWorker
  }

  // Route initiale lue dans l'URL (le routeur n'a pas forcément terminé sa
  // première navigation quand les plugins s'exécutent), puis navigations SPA.
  registerIfDashboard(window.location.pathname)
  useRouter().afterEach((to) => registerIfDashboard(to.path))

  async function prompt() {
    const event = deferred
    if (!event) return 'unavailable' as const
    // Chrome ne rejoue l'événement qu'après un délai : une seule invite par capture.
    deferred = null
    canPrompt.value = false
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  }

  async function applyUpdate() {
    await updateServiceWorker?.(true)
  }

  const pwaInstall: PwaInstallApi = { canPrompt, installed, needRefresh, prompt, applyUpdate }
  return { provide: { pwaInstall } }
})
