export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, fetch } = useUserSession()
  if (!loggedIn.value) {
    await fetch()
  }

  if (loggedIn.value) {
    return navigateTo('/dashboard')
  }
})
