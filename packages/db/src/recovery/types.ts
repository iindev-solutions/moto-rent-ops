/** Version of the on-disk backup manifest format. */
export const RECOVERY_MANIFEST_VERSION = 1

/** Version of the drill tool that produced a manifest. */
export const RECOVERY_TOOL_VERSION = '1.0.0'

/**
 * Data format version covered by a backup. Bump this whenever a migration adds
 * or changes a table that participates in verification.
 */
export const RECOVERY_DATA_FORMAT_VERSION = '0020'

export const RECOVERY_SOURCE_ENVIRONMENTS = ['development', 'staging', 'production'] as const
export type RecoverySourceEnvironment = typeof RECOVERY_SOURCE_ENVIRONMENTS[number]

export interface ManifestDocument {
  /** Storage key in the object storage adapter. Never exposed through the API. */
  storageKey: string
  contentType: string
  /** Path relative to the artifact root. Must never escape it. */
  path: string
  /** SHA-256 in the form `sha256:<64 lowercase hex>`. */
  checksum: string
  bytes: number
}

export interface ScopeStats {
  /** Stable scope name: a record group such as `motorcycles` or `financial:VND`. */
  name: string
  count: number
  /** Total in minor units for financial scopes; null for record groups. */
  totalMinor: number | null
  /** ISO 4217 currency for financial scopes; null for record groups. */
  currency: string | null
}

export interface BackupManifest {
  manifestVersion: number
  createdAt: string
  sourceEnvironment: string
  dataFormatVersion: string
  databaseChecksum: string
  databaseBytes: number
  documents: ManifestDocument[]
  scopes: ScopeStats[]
  toolVersion: string
}

export type ScopeMismatchCode =
  | 'count_mismatch'
  | 'total_mismatch'
  | 'scope_missing'
  | 'unexpected_scope'

export interface ScopeComparison {
  scope: string
  expectedCount: number
  actualCount: number
  expectedTotalMinor: number | null
  actualTotalMinor: number | null
  currency: string | null
  status: 'passed' | 'failed'
  mismatchCode: ScopeMismatchCode | null
}

export interface VerificationResult {
  status: 'passed' | 'failed'
  scopes: ScopeComparison[]
  /** Allowlisted failure code; never a raw exception message. */
  failureCode: 'scope_mismatch' | null
}

export interface DatabaseArtifact {
  checksum: string
  bytes: number
}

/**
 * Engine-specific backup and restore. Implementations own their consistency
 * mechanism (data directory snapshot or pg_dump custom archive).
 */
export interface RecoveryProvider {
  readonly kind: 'pglite' | 'postgres'
  fingerprint(): string
  backup(artifactDir: string): Promise<DatabaseArtifact>
  restore(artifactDir: string): Promise<void>
  collectStats(): Promise<ScopeStats[]>
  close(): Promise<void>
}

export class RecoveryIsolationError extends Error {
  readonly code = 'isolation_refused'

  constructor(readonly reasonCode: string, message: string) {
    super(message)
    this.name = 'RecoveryIsolationError'
  }
}

export class RecoveryConfigurationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'RecoveryConfigurationError'
  }
}

export class RecoveryExecutionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'RecoveryExecutionError'
  }
}
