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
    if (cachedCardRoute) {
      return
    }
    // Bike QR scans get a public customer view instead of a login wall; staff
    // sign in from there. Everything else still requires authentication.
    if (to.path.startsWith('/b/')) {
      return
    }
    return navigateTo({
      path: '/login',
      query: { returnTo: to.fullPath },
    })
  }

  if (import.meta.client && navigator.onLine) {
    rememberOfflineAccess()
  }
})
