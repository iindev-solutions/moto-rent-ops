import { RecoveryIsolationError } from './types'

export interface IsolationCheck {
  /** Explicit operator marker. Restores require exactly `isolated`. */
  targetEnvironment?: string | null
  /** Stable, non-secret description of the restore target. */
  targetFingerprint: string
  /** Fingerprints of every known production target. */
  productionFingerprints?: string[]
  /** Fingerprint of the source database. */
  sourceFingerprint?: string
}

/**
 * Fails closed. A restore needs three independent signals: an explicit isolated
 * marker, a resolvable target, and a target that differs from production and
 * from the source database.
 */
export function assertIsolatedTarget(check: IsolationCheck): void {
  const marker = (check.targetEnvironment ?? '').trim().toLowerCase()
  if (marker === '') {
    throw new RecoveryIsolationError(
      'target_env_missing',
      'Isolation guard: an isolated target marker is required (RECOVERY_TARGET_ENV=isolated)',
    )
  }
  if (marker !== 'isolated') {
    throw new RecoveryIsolationError(
      'target_env_not_isolated',
      `Isolation guard: restore target must be isolated, received "${check.targetEnvironment}"`,
    )
  }

  const fingerprint = (check.targetFingerprint ?? '').trim()
  if (fingerprint === '') {
    throw new RecoveryIsolationError('target_fingerprint_missing', 'Isolation guard: target fingerprint is required')
  }

  const production = (check.productionFingerprints ?? [])
    .map(value => value.trim())
    .filter(Boolean)
  if (production.includes(fingerprint)) {
    throw new RecoveryIsolationError(
      'target_matches_production',
      'Isolation guard: target matches a production fingerprint',
    )
  }

  const source = (check.sourceFingerprint ?? '').trim()
  if (source !== '' && source === fingerprint) {
    throw new RecoveryIsolationError(
      'target_matches_source',
      'Isolation guard: target equals the source database',
    )
  }
}
