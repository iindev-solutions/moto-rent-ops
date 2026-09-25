import type { User } from '#auth-utils'
import { normalizeLocatorToken } from '@book-moto/domain/qr'

export async function requireAppUser(event: Parameters<typeof requireUserSession>[0]) {
  const session = await requireUserSession(event)
  if (!session.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  return session.user
}

export function canAccessLocation(user: User, location: string | null) {
  if (user.role === 'owner' || user.role === 'admin' || user.locationScope.includes('*')) {
    return true
  }
  return location !== null && user.locationScope.includes(location)
}

export function safeBikeReturnTo(value: unknown) {
  if (typeof value !== 'string' || !/^\/b\/[A-Za-z0-9-]+$/.test(value)) {
    return '/'
  }

  const token = normalizeLocatorToken(value)
  return token ? `/b/${token}` : '/'
}
