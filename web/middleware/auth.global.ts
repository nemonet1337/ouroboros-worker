const PUBLIC_ROUTES = new Set(['/login', '/register'])

export default defineNuxtRouteMiddleware(async (to) => {
  // SPA-only guard; skip during SSR (ssr is disabled anyway).
  if (import.meta.server) return

  const { user, loaded, fetchMe } = useAuth()
  if (!loaded.value) await fetchMe()

  const isPublic = PUBLIC_ROUTES.has(to.path)
  if (!user.value && !isPublic) {
    return navigateTo('/login')
  }
  if (user.value && isPublic) {
    return navigateTo('/')
  }
})
