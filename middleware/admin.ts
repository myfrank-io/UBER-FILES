// Protège les routes d'administration (Chams).
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession()
  if (!loggedIn.value || (user.value as { role?: string })?.role !== 'ADMIN') {
    return navigateTo('/dashboard/login')
  }
})
