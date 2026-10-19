import { decryptLocatorToken } from '@book-moto/db/crypto'

export function safeDecryptLocatorToken(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return decryptLocatorToken(value)
  } catch {
    return null
  }
}
