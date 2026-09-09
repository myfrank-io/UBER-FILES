// Installation « écran d'accueil » (PWA) de l'espace chauffeur — logique pure,
// sans DOM, testée. Utilisée par plugins/pwa.client.ts et usePwaInstall.
//
// Deux mondes : sur Android (Chromium) le navigateur émet `beforeinstallprompt`
// et on peut déclencher l'invite native ; sur iOS il n'existe aucune API, il
// faut guider le chauffeur vers Partager → « Sur l'écran d'accueil ».

export type InstallPlatform = 'ios' | 'android' | 'desktop'

// Périmètre de l'app chauffeur — identique au `scope` du manifeste. Le service
// worker n'est enregistré que là (plugins/pwa.client.ts) et le manifeste n'est
// lié que là (server/plugins/pwa-manifest.ts) : la page publique d'un chauffeur
// reste un site classique pour ses passagers.
const DRIVER_APP_PATH = /^\/dashboard(?:[/?#]|$)/

/**
 * Vrai si ce chemin fait partie de l'espace chauffeur installable. Le `/` final
 * compte : « /dashboardeur » n'est pas le dashboard.
 */
export function isDriverAppPath(path: string): boolean {
  return DRIVER_APP_PATH.test(path)
}

/**
 * Plateforme d'installation déduite du user-agent. iPadOS se présente comme un
 * Mac de bureau : on le reconnaît à son écran tactile (maxTouchPoints > 1).
 */
export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'desktop'
}

/** Durée pendant laquelle l'invitation de l'accueil se tait après « Plus tard ». */
export const INSTALL_SNOOZE_DAYS = 30

/**
 * Valeur à mémoriser pour reporter l'invitation : l'instant (ms) où elle pourra
 * réapparaître. Une chaîne, pour aller telle quelle dans localStorage.
 */
export function installSnoozeUntil(now: number, days = INSTALL_SNOOZE_DAYS): string {
  return String(now + days * 24 * 60 * 60 * 1000)
}

/** Vrai tant que l'échéance mémorisée est dans le futur. Valeur absente ou illisible = pas de report. */
export function isInstallSnoozed(stored: string | null | undefined, now: number): boolean {
  if (!stored) return false
  const until = Number(stored)
  return Number.isFinite(until) && until > now
}
