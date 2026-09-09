// Gestionnaires push du service worker Ridewiz — importé par sw.js (Workbox,
// option importScripts). Fichier statique, volontairement sans build.
/* global self */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/badge-96x96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/dashboard' },
  }
  // Toujours afficher quelque chose : iOS retire la permission à une app dont
  // les push restent silencieux.
  event.waitUntil(self.registration.showNotification(data.title || 'Ridewiz', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  const target = new URL(url, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Fenêtre Ridewiz déjà ouverte (app installée ou onglet) : on la ramène
      // au premier plan sur la bonne page, sinon on en ouvre une.
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})

// Le navigateur a renouvelé l'abonnement de lui-même : on réenregistre le
// nouveau côté serveur, sans rien demander au chauffeur.
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription
  const key = old && old.options && old.options.applicationServerKey
  if (!key) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch('/api/dashboard/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(sub.toJSON()),
        }),
      )
      .catch(() => {}),
  )
})
