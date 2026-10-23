import { hasValidOfflineAccess, rememberOfflineAccess } from '~/composables/useOfflineAccess'

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, fetch } = useUserSession()
  if (!loggedIn.value) {
    try {
      await fetch()
    } catch {
      // The session endpoint is unreachable; the cached card fallback below
      // still requires a previously verified session on this device.
    }
  }

  if (!loggedIn.value) {
    const cachedCardRoute = import.meta.client
      && !navigator.onLine
      && to.path.startsWith('/b/')
      && hasValidOfflineAccess()
    if (!cachedCardRoute) {
      return navigateTo({
        path: '/login',
        query: { returnTo: to.fullPath },
      })
    }
    return
  }

  if (import.meta.client && navigator.onLine) {
    rememberOfflineAccess()
  }
})
