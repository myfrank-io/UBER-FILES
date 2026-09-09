import { isDriverAppPath } from '~~/lib/pwa-install'

// <link rel="manifest"> injecté ici, côté serveur, plutôt que par le layout
// dashboard : Chrome ne propose « Installer l'application » que si la page
// affichée lie un manifeste. Or /dashboard/login utilise le layout `default`,
// qui n'en liait aucun — et c'est là qu'atterrit tout chauffeur non connecté,
// /dashboard y redirigeant. Sur cette page, « beforeinstallprompt » ne se
// déclenchait donc jamais : il ne restait que « Ajouter à l'écran d'accueil »,
// un simple raccourci ouvert dans un onglet, sans plein écran ni notifications.
//
// Le servir dans le HTML vaut aussi pour le reste de l'espace chauffeur : en
// `ssr: false`, le HTML est une coquille vide et le lien n'arrivait qu'après
// l'hydratation. Chrome relance bien son analyse quand le lien apparaît — la
// page finissait par être installable — mais avec un temps de retard, et à la
// merci du moment où le layout se monte.
//
// Restreint à /dashboard, comme le service worker (plugins/pwa.client.ts) : la
// page publique d'un chauffeur reste un site classique. Ce n'est pas qu'une
// question de poids — le manifeste pointe `start_url` sur /dashboard, donc un
// passager qui ajoute la page de son chauffeur à son écran d'accueil se
// retrouverait devant l'écran de connexion chauffeur.
const MANIFEST_LINK = '<link rel="manifest" href="/manifest.webmanifest">'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    if (!isDriverAppPath(event.path)) return
    html.head.push(MANIFEST_LINK)
  })
})
