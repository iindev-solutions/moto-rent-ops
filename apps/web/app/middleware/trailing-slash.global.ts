/**
 * Trailing slashes land on the SPA shell without a matching page (e.g. a cached
 * `/bikes` → `/bikes/` redirect), so normalise them before matching.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path.length > 1 && to.path.endsWith('/')) {
    return navigateTo(
      { path: to.path.replace(/\/+$/, ''), query: to.query, hash: to.hash },
      { redirectCode: 301 },
    )
  }
})
