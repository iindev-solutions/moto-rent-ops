import { randomUUID } from 'node:crypto'
import { canonicalizeLocatorToken, generateManualCode } from '@book-moto/domain/qr'
import { encryptLocatorToken, hashLocatorToken } from '@book-moto/db/crypto'

export function createQrCredentials() {
  const token = canonicalizeLocatorToken(randomUUID())
  if (!token) {
    throw createError({ statusCode: 500, statusMessage: 'Could not generate locator token' })
  }

  return {
    token,
    manualCode: generateManualCode(),
    tokenHash: hashLocatorToken(token),
    tokenCiphertext: encryptLocatorToken(token),
  }
}
