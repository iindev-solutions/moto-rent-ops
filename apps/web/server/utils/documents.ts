const EXPIRING_SOON_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export type DocumentExpiryStatus = 'expired' | 'expiring_soon' | 'valid'

export function documentExpiryStatus(expiresAt: Date | null | undefined, now: Date = new Date()): DocumentExpiryStatus | null {
  if (!expiresAt) return null
  const time = expiresAt.getTime()
  if (Number.isNaN(time)) return null
  if (time < now.getTime()) return 'expired'
  if (time <= now.getTime() + EXPIRING_SOON_DAYS * DAY_MS) return 'expiring_soon'
  return 'valid'
}

export function hasValidHeldDocument(documents: Array<{ expiresAt: Date | null }>, now: Date = new Date()): boolean {
  return documents.some(document => !document.expiresAt || document.expiresAt.getTime() >= now.getTime())
}
