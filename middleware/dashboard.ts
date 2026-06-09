// Protège les routes du back-office chauffeur : redirige vers le login si non connecté.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()
  if (to.path === '/dashboard/login') return
  if (!loggedIn.value || (user.value as { role?: string })?.role !== 'DRIVER') {
    return navigateTo('/dashboard/login')
  }
})
