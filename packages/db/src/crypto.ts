import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function encryptionKey() {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY
  if (!encoded) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required')
  }

  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes')
  }

  return key
}

export function hashLocatorToken(token: string) {
  const canonicalToken = canonicalizeLocatorToken(token)
  if (!canonicalToken) {
    throw new Error('Invalid bike locator token')
  }

  return createHash('sha256').update(`book-moto:v1:${canonicalToken}`).digest('hex')
}

export function encryptLocatorToken(token: string) {
  const canonicalToken = canonicalizeLocatorToken(token)
  if (!canonicalToken) {
    throw new Error('Invalid bike locator token')
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(canonicalToken, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map(value => value.toString('base64url')).join('.')
}

export function decryptLocatorToken(value: string) {
  const [encodedIv, encodedTag, encodedCiphertext] = value.split('.')
  if (!encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error('Invalid encrypted locator token')
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64url'))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
  return canonicalizeLocatorToken(plaintext)
}
