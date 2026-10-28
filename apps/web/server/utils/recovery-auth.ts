import type { User } from '#auth-utils'
import { requireOwnerOrAdmin } from './auth'

/**
 * Recovery readiness and drill evidence are operational controls: only an
 * owner or admin may read them. Shared by every `/api/recovery/*` route so the
 * policy cannot drift between endpoints.
 */
export function requireRecoveryAdmin(user: User) {
  requireOwnerOrAdmin(user)
}
