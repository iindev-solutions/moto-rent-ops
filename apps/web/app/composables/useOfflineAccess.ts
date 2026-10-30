const STORAGE_KEY = 'moto-offline-access'
const TTL_MS = 24 * 60 * 60 * 1000

type OfflineAccessMarker = { at: number }

function readMarker(): OfflineAccessMarker | null {
  if (!import.meta.client) {
    return null
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<OfflineAccessMarker>
    return typeof parsed.at === 'number' ? { at: parsed.at } : null
  } catch {
    return null
  }
}

/**
 * Remembers that this device had a valid staff session. It does not store any
 * identity data and only unlocks the read-only cached bike card route while the
 * API is unreachable. Sign-out clears it.
 */
export function rememberOfflineAccess(): void {
  if (!import.meta.client) {
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now() } satisfies OfflineAccessMarker))
  } catch {
    // Storage may be unavailable in private mode; offline access is optional.
  }
}

export function clearOfflineAccess(): void {
  if (!import.meta.client) {
    return
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures on sign-out.
  }
}

export function hasValidOfflineAccess(): boolean {
  const marker = readMarker()
  return Boolean(marker && Date.now() - marker.at <= TTL_MS)
}
