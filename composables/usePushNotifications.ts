// Notifications push de l'app (PWA), côté chauffeur.
//
// Sur iPhone, l'API push n'existe qu'une fois l'app ajoutée à l'écran d'accueil
// et ouverte depuis son icône ; partout, la permission ne peut être demandée
// que depuis un geste du chauffeur (bouton). Le service worker est enregistré
// sur /dashboard par plugins/pwa.client.ts ; ses gestionnaires push sont dans
// public/push-sw.js.
import { vapidKeyToBytes } from '~/lib/push-key'

export type PushState =
  | 'unsupported' // navigateur sans push (bureau ancien, navigateur intégré…)
  | 'needs-install' // iPhone : l'app doit d'abord être sur l'écran d'accueil
  | 'blocked' // permission refusée dans les réglages du téléphone
  | 'off'
  | 'on'

export function usePushNotifications() {
  const publicKey = useRuntimeConfig().public.vapidPublicKey
  // Sans clé publique, le serveur n'a pas de clés VAPID : rien à proposer.
  const configured = Boolean(publicKey)
  const { installed, isIos } = usePwaInstall()

  const state = ref<PushState>('unsupported')
  const busy = ref(false)
  const error = ref('')

  function supported(): boolean {
    return import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }

  async function refresh() {
    if (!import.meta.client) return
    if (!supported()) {
      state.value = isIos.value && !installed.value ? 'needs-install' : 'unsupported'
      return
    }
    if (Notification.permission === 'denied') {
      state.value = 'blocked'
      return
    }
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    state.value = subscription ? 'on' : 'off'
  }

  async function enable(): Promise<boolean> {
    error.value = ''
    busy.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        state.value = permission === 'denied' ? 'blocked' : 'off'
        return false
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToBytes(publicKey),
      })
      await $fetch('/api/dashboard/push/subscribe', {
        method: 'POST',
        body: { ...subscription.toJSON(), userAgent: navigator.userAgent },
      })
      state.value = 'on'
      return true
    } catch {
      error.value = "Impossible d'activer les notifications sur cet appareil. Réessayez."
      return false
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<void> {
    error.value = ''
    busy.value = true
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = registration ? await registration.pushManager.getSubscription() : null
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await $fetch('/api/dashboard/push/unsubscribe', { method: 'POST', body: { endpoint } })
      }
      state.value = 'off'
    } catch {
      error.value = 'La désactivation a échoué. Réessayez.'
    } finally {
      busy.value = false
    }
  }

  /** Envoie une notification de test à tous les appareils du chauffeur. */
  async function sendTest(): Promise<number> {
    const res = await $fetch<{ configured: boolean; sent: number }>('/api/dashboard/push/test', { method: 'POST' })
    return res.sent
  }

  onMounted(refresh)

  return { configured, state, busy, error, refresh, enable, disable, sendTest }
}
