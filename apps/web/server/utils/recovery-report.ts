import {
  RecoveryConfigurationError,
  RecoveryExecutionError,
  RecoveryIsolationError,
  type ScopeComparison,
} from '@book-moto/db/recovery'
import { DocumentRecoveryError } from '@book-moto/storage'

/**
 * Failure codes are the only failure detail allowed in a report. Raw errors can
 * contain SQL, paths, credentials or PII and never leave the process.
 */
export const RECOVERY_FAILURE_CODES = [
  'isolation_refused',
  'operator_not_found',
  'operator_not_authorized',
  'target_not_empty',
  'artifact_exists',
  'artifact_invalid',
  'checksum_mismatch',
  'document_mismatch',
  'backup_failed',
  'restore_failed',
  'scope_mismatch',
  'configuration_error',
  'internal_error',
] as const

export type RecoveryFailureCode = typeof RECOVERY_FAILURE_CODES[number]

export type RecoveryCommand = 'backup' | 'restore' | 'drill' | 'verify'

export interface RecoveryReport {
  command: RecoveryCommand
  status: 'passed' | 'failed'
  drillId: string | null
  artifactRef: string
  manifestChecksum: string | null
  startedAt: string
  finishedAt: string
  scopes: Array<{
    scope: string
    expectedCount: number
    actualCount: number
    expectedTotalMinor: number | null
    actualTotalMinor: number | null
    currency: string | null
    status: 'passed' | 'failed'
    mismatchCode: string | null
  }>
  failureCode: string | null
}

export interface RecoveryReportInput {
  command: RecoveryCommand
  status: 'passed' | 'failed'
  drillId?: string | null
  artifactRef: string
  manifestChecksum?: string | null
  startedAt: string
  finishedAt: string
  scopes: ScopeComparison[]
  failureCode?: string | null
}

function isFailureCode(value: string): value is RecoveryFailureCode {
  return (RECOVERY_FAILURE_CODES as readonly string[]).includes(value)
}

export function safeFailureCode(error: unknown): RecoveryFailureCode {
  if (error instanceof RecoveryIsolationError) return 'isolation_refused'
  if (error instanceof DocumentRecoveryError) {
    return error.code === 'document_checksum_mismatch' ? 'checksum_mismatch' : 'document_mismatch'
  }
  if (error instanceof RecoveryConfigurationError && isFailureCode(error.code)) return error.code
  if (error instanceof RecoveryExecutionError && isFailureCode(error.code)) return error.code
  return 'internal_error'
}

/**
 * Builds the contract JSON from an explicit allowlist. Unknown fields on the
 * input are dropped, so a future internal field cannot leak by accident.
 */
export function buildRecoveryReport(input: RecoveryReportInput): RecoveryReport {
  return {
    command: input.command,
    status: input.status,
    drillId: input.drillId ?? null,
    artifactRef: input.artifactRef,
    manifestChecksum: input.manifestChecksum ?? null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    scopes: input.scopes.map(scope => ({
      scope: scope.scope,
      expectedCount: scope.expectedCount,
      actualCount: scope.actualCount,
      expectedTotalMinor: scope.expectedTotalMinor,
      actualTotalMinor: scope.actualTotalMinor,
      currency: scope.currency,
      status: scope.status,
      mismatchCode: scope.mismatchCode,
    })),
    failureCode: input.failureCode ?? null,
  }
}

export interface RecoveryDrillRow {
  id: string
  status: string
  startedAt: Date
  finishedAt: Date | null
  targetEnvironment: string
  artifactRef: string
  manifestChecksum: string | null
  failureCode: string | null
}

export interface RecoveryScopeRow {
  scope: string
  expectedCount: number
  actualCount: number
  expectedTotalMinor: number | null
  actualTotalMinor: number | null
  currency: string | null
  status: string
  mismatchCode: string | null
}

/** List projection: no manifest contents, no operator email, no PII. */
export function serializeDrillListItem(row: RecoveryDrillRow, operatorName: string) {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    operatorName,
    targetEnvironment: row.targetEnvironment,
    artifactRef: row.artifactRef,
    failureCode: row.failureCode,
  }
}

/** Detail projection: explicit fields only, including immutable scope results. */
export function serializeDrillDetail(row: RecoveryDrillRow, scopes: ReadonlyArray<RecoveryScopeRow>, operatorName: string) {
  return {
    ...serializeDrillListItem(row, operatorName),
    manifestChecksum: row.manifestChecksum,
    scopes: scopes.map(scope => ({
      scope: scope.scope,
      expectedCount: scope.expectedCount,
      actualCount: scope.actualCount,
      expectedTotalMinor: scope.expectedTotalMinor,
      actualTotalMinor: scope.actualTotalMinor,
      currency: scope.currency,
      status: scope.status,
      mismatchCode: scope.mismatchCode,
    })),
  }
}
