const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export const MANUAL_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const MANUAL_CODE_LENGTH = 10
const MANUAL_CODE_RE = new RegExp(`^[${MANUAL_CODE_ALPHABET}]{${MANUAL_CODE_LENGTH}}$`)

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

export function canonicalizeManualCode(value: string): string | null {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  return MANUAL_CODE_RE.test(compact) ? compact : null
}

export function formatManualCode(value: string): string {
  const canonical = canonicalizeManualCode(value)
  if (!canonical) {
    throw new Error('Invalid manual code')
  }
  return `${canonical.slice(0, 5)}-${canonical.slice(5)}`
}

export function generateManualCode(randomValues: (target: Uint8Array) => Uint8Array = target => crypto.getRandomValues(target)): string {
  const bytes = randomValues(new Uint8Array(MANUAL_CODE_LENGTH))
  let code = ''
  for (const byte of bytes) {
    code += MANUAL_CODE_ALPHABET[byte % MANUAL_CODE_ALPHABET.length]
  }
  return code
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
  const directManualCode = canonicalizeManualCode(trimmed)
  if (directManualCode) {
    return directManualCode
  }

  const relativeMatch = trimmed.match(/^\/b\/([^/?#]+)$/)
  if (relativeMatch?.[1]) {
    return canonicalizeLocatorToken(relativeMatch[1]) ?? canonicalizeManualCode(relativeMatch[1])
  }

  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/^\/b\/([^/]+)$/)
    const candidate = match?.[1]
    return candidate ? canonicalizeLocatorToken(candidate) ?? canonicalizeManualCode(candidate) : null
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
