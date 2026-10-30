/**
 * Opening a bike card after a QR scan or manual code entry.
 *
 * The navigation itself is what takes time (the card fetches its data), so the
 * overlay is tied to it — but a fast navigation must not flash a spinner. The
 * flag therefore appears only after a short delay and disappears with the
 * navigation promise.
 */
export function useScanNavigation() {
  const router = useRouter()
  const route = useRoute()
  const resolving = ref(false)
  let showTimer: number | undefined

  // Release the overlay as soon as the card route is on screen; the card's own
  // skeleton carries the remaining data load.
  watch(() => route.fullPath, (path) => {
    if (!path.startsWith('/b/')) return
    if (showTimer !== undefined) window.clearTimeout(showTimer)
    resolving.value = false
  })

  async function openBike(token: string): Promise<void> {
    showTimer = window.setTimeout(() => { resolving.value = true }, 180)
    try {
      await router.push(`/b/${token}`)
    } finally {
      window.clearTimeout(showTimer)
      resolving.value = false
    }
  }

  onBeforeUnmount(() => {
    if (showTimer !== undefined) window.clearTimeout(showTimer)
  })

  return { resolving, openBike }
}
