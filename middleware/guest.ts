// Réservé aux visiteurs non connectés (page de connexion) : un utilisateur
// déjà authentifié sur cet appareil est envoyé directement vers son espace.
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession()
  if (!loggedIn.value) return
  const role = (user.value as { role?: string })?.role
  return navigateTo(role === 'ADMIN' ? '/admin' : '/dashboard', { replace: true })
})
