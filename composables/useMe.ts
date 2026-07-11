// Profil du chauffeur connecté (/api/dashboard/me), partagé entre le layout et
// les pages du dashboard via une clé commune.
//
// `getCachedData` réutilise la donnée déjà en mémoire lors des navigations
// internes : sans lui, chaque changement de page relançait l'appel (endpoint
// coûteux : ligne Driver + 4 relations) et affichait un spinner. Les pages qui
// modifient le profil continuent d'appeler `refresh()` pour forcer la mise à jour.
//
// La clé inclut l'id utilisateur : après déconnexion/reconnexion dans le même
// onglet, on ne resservira jamais le cache d'un autre compte.
export function useMe() {
  const { user } = useUserSession()
  const key = `dashboard-me:${(user.value as { id?: string } | null)?.id ?? 'anon'}`
  return useFetch('/api/dashboard/me', {
    key,
    lazy: true,
    getCachedData: (k, nuxtApp) => nuxtApp.payload.data[k] ?? nuxtApp.static.data[k],
  })
}
