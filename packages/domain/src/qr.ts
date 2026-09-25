const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export function canonicalizeLocatorToken(value: string): string | null {
  const trimmed = value.trim()
  if (UUID_RE.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  if (ULID_RE.test(trimmed)) {
    return trimmed.toUpperCase()
  }
  return null
}

export function isValidLocatorToken(value: string): boolean {
  return canonicalizeLocatorToken(value) !== null
}

export function normalizeLocatorToken(value: string): string | null {
  const trimmed = value.trim()
  const directToken = canonicalizeLocatorToken(trimmed)
  if (directToken) {
    return directToken
  }

  const relativeMatch = trimmed.match(/^\/b\/([^/]+)$/)
  if (relativeMatch?.[1]) {
    return canonicalizeLocatorToken(relativeMatch[1])
  }

  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/^\/b\/([^/]+)$/)
    return match?.[1] ? canonicalizeLocatorToken(match[1]) : null
  } catch {
    return null
  }
}

export function buildBikeDeepLink(origin: string, token: string): string {
  const canonicalToken = canonicalizeLocatorToken(token)
  if (!canonicalToken) {
    throw new Error('Invalid bike locator token')
  }

  return new URL(`/b/${canonicalToken}`, origin).toString()
}
