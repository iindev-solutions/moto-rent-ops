import { and, asc, eq, sql } from 'drizzle-orm'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  attachments,
  auditEvents,
  closeDb,
  getDb,
  recoveryDrillScopes,
  recoveryDrills,
  repositoryRoot,
  resolvePgliteDataDir,
  users,
  type AppDatabase,
  type DbTransaction,
} from '@book-moto/db'
import {
  RECOVERY_DATA_FORMAT_VERSION,
  RECOVERY_MANIFEST_VERSION,
  RECOVERY_SOURCE_ENVIRONMENTS,
  RECOVERY_TOOL_VERSION,
  RecoveryConfigurationError,
  RecoveryExecutionError,
  RecoveryIsolationError,
  assertIsolatedTarget,
  collectScopeStats,
  compareScopes,
  createPgliteProvider,
  createPostgresProvider,
  hashDirectory,
  readManifest,
  sha256File,
  writeManifest,
  type BackupManifest,
  type RecoveryProvider,
  type ScopeComparison,
  type VerificationResult,
} from '@book-moto/db/recovery'
import {
  LocalObjectStorage,
  S3ObjectStorage,
  backupDocuments,
  restoreDocuments,
  verifyRestoredDocuments,
  type ObjectStorage,
} from '@book-moto/storage'
import { safeFailureCode, type RecoveryFailureCode } from './recovery-report'

const DEFAULT_RECOVERY_ROOT = '.data/recovery'

export interface RecoveryBackupOptions {
  /** Artifact directory, absolute or relative to the repository root. */
  targetDir: string
  recoveryRoot?: string
  sourceProvider?: RecoveryProvider
  sourceStorage?: ObjectStorage
  sourceStorageRoot?: string
  now?: Date
}

export interface RecoveryBackupResult {
  artifactDir: string
  artifactRef: string
  manifest: BackupManifest
  manifestChecksum: string
  startedAt: Date
  finishedAt: Date
  sourceFingerprint: string
}

export interface RecoveryRestoreOptions {
  artifactDir: string
  recoveryRoot?: string
  targetEnvironment?: string
  targetPgliteDir?: string
  targetDatabaseUrl?: string
  targetProvider?: RecoveryProvider
  targetStorage?: ObjectStorage
  targetStorageRoot?: string
  sourceFingerprint?: string
  productionFingerprints?: string[]
}

export interface RecoveryRestoreResult {
  artifactRef: string
  manifest: BackupManifest
  manifestChecksum: string
  verification: VerificationResult
  startedAt: Date
  finishedAt: Date
}

export type RecoveryVerifyResult = RecoveryRestoreResult

export interface DrillOptions {
  targetDir: string
  operatorEmail: string
  recoveryRoot?: string
  targetEnvironment?: string
  targetPgliteDir?: string
  targetDatabaseUrl?: string
  targetStorageRoot?: string
  sourceStorageRoot?: string
  sourceProvider?: RecoveryProvider
  targetProvider?: RecoveryProvider
  sourceStorage?: ObjectStorage
  targetStorage?: ObjectStorage
  productionFingerprints?: string[]
  now?: Date
}

export interface DrillResult {
  drillId: string
  status: 'passed' | 'failed'
  artifactRef: string
  manifestChecksum: string
  startedAt: string
  finishedAt: string
  scopes: ScopeComparison[]
  failureCode: string | null
  targetEnvironment: string
}

export interface DrillEvidenceInput {
  operatorEmail: string
  startedAt: Date
  finishedAt: Date
  targetEnvironment: string
  artifactRef: string
  manifestChecksum: string | null
  verification: VerificationResult
}

function resolveRecoveryRoot(explicit?: string) {
  const configured = explicit ?? process.env.RECOVERY_ROOT ?? DEFAULT_RECOVERY_ROOT
  return isAbsolute(configured) ? resolve(configured) : resolve(repositoryRoot, configured)
}

function resolveInsideRecoveryRoot(root: string, targetDir: string) {
  const target = isAbsolute(targetDir) ? resolve(targetDir) : resolve(repositoryRoot, targetDir)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new RecoveryConfigurationError(
      'artifact_invalid',
      'Artifact directory must be inside the configured recovery root',
    )
  }
  return { artifactDir: target, artifactRef: rel.replaceAll('\\', '/') }
}

async function ensureEmptyDirectory(path: string) {
  try {
    const entries = await readdir(path)
    if (entries.length > 0) {
      throw new RecoveryConfigurationError('artifact_exists', `Directory is not empty: ${path}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await mkdir(path, { recursive: true })
  }
}

function sourceEnvironment() {
  const candidates = [process.env.RECOVERY_SOURCE_ENV, process.env.NODE_ENV, 'development']
  for (const candidate of candidates) {
    if (candidate && (RECOVERY_SOURCE_ENVIRONMENTS as readonly string[]).includes(candidate)) {
      return candidate
    }
  }
  return 'development'
}

function createRecoveryStorage(options: {
  explicitRoot?: string
  envPrefix: string
  defaultLocalRoot: string
}): ObjectStorage {
  if (options.explicitRoot) return new LocalObjectStorage(options.explicitRoot)

  const endpoint = process.env[`${options.envPrefix}S3_ENDPOINT`]
  const bucket = process.env[`${options.envPrefix}S3_BUCKET`]
  const accessKeyId = process.env[`${options.envPrefix}S3_ACCESS_KEY_ID`]
  const secretAccessKey = process.env[`${options.envPrefix}S3_SECRET_ACCESS_KEY`]
  if (endpoint && !endpoint.startsWith('file://') && bucket && accessKeyId && secretAccessKey) {
    return new S3ObjectStorage({
      endpoint,
      region: process.env[`${options.envPrefix}S3_REGION`] || 'us-east-1',
      bucket,
      accessKeyId,
      secretAccessKey,
    })
  }

  const fileEndpoint = endpoint?.startsWith('file://') ? endpoint.slice('file://'.length) : undefined
  const localRoot = fileEndpoint
    ? (isAbsolute(fileEndpoint) ? fileEndpoint : resolve(repositoryRoot, fileEndpoint))
    : options.defaultLocalRoot
  return new LocalObjectStorage(localRoot)
}

function defaultSourceStorageRoot() {
  const endpoint = process.env.S3_ENDPOINT
  if (endpoint?.startsWith('file://')) {
    const raw = endpoint.slice('file://'.length)
    return isAbsolute(raw) ? raw : resolve(repositoryRoot, raw)
  }
  return resolve(repositoryRoot, '.data/documents')
}

async function defaultSourceProvider() {
  const db = await getDb()
  if (process.env.DATABASE_PROVIDER === 'postgres' || process.env.DATABASE_URL) {
    return createPostgresProvider({ databaseUrl: process.env.DATABASE_URL ?? '', db })
  }
  return createPgliteProvider({ dataDir: resolvePgliteDataDir(), db })
}

function defaultTargetProvider(options: {
  root: string
  targetPgliteDir?: string
  targetDatabaseUrl?: string
}) {
  if (process.env.DATABASE_PROVIDER === 'postgres' || process.env.DATABASE_URL) {
    const databaseUrl = options.targetDatabaseUrl ?? process.env.RECOVERY_TARGET_DATABASE_URL
    if (!databaseUrl) {
      throw new RecoveryConfigurationError(
        'configuration_error',
        'RECOVERY_TARGET_DATABASE_URL is required for a PostgreSQL recovery drill',
      )
    }
    return createPostgresProvider({ databaseUrl })
  }

  const dataDir = options.targetPgliteDir
    ?? process.env.RECOVERY_TARGET_PGLITE_DIR
    ?? join(options.root, 'target/pglite')
  return createPgliteProvider({ dataDir })
}

function configuredProductionFingerprints(explicit?: string[]) {
  const fingerprints = (explicit ?? [])
    .map(value => value.trim())
    .filter(Boolean)
  for (const value of (process.env.RECOVERY_PRODUCTION_FINGERPRINT ?? '').split(',')) {
    if (value.trim()) fingerprints.push(value.trim())
  }
  const productionUrl = process.env.RECOVERY_PRODUCTION_DATABASE_URL
  if (productionUrl) {
    fingerprints.push(createPostgresProvider({ databaseUrl: productionUrl }).fingerprint())
  }
  return fingerprints
}

async function verifyDatabaseArtifact(artifactDir: string, manifest: BackupManifest, kind: RecoveryProvider['kind']) {
  if (kind === 'pglite') {
    const actual = await hashDirectory(join(artifactDir, 'database'))
    if (actual.checksum !== manifest.databaseChecksum || actual.bytes !== manifest.databaseBytes) {
      throw new RecoveryExecutionError('checksum_mismatch', 'Database artifact checksum does not match the manifest')
    }
    return
  }

  const dump = join(artifactDir, 'database.dump')
  const info = await stat(dump)
  if (info.size !== manifest.databaseBytes || await sha256File(dump) !== manifest.databaseChecksum) {
    throw new RecoveryExecutionError('checksum_mismatch', 'Database dump checksum does not match the manifest')
  }
}

async function kindOfArtifact(artifactDir: string): Promise<RecoveryProvider['kind']> {
  try {
    const info = await stat(join(artifactDir, 'database'))
    if (info.isDirectory()) return 'pglite'
  } catch {
    // Fall through to the PostgreSQL archive check.
  }
  try {
    const info = await stat(join(artifactDir, 'database.dump'))
    if (info.isFile()) return 'postgres'
  } catch {
    // Reported below.
  }
  throw new RecoveryConfigurationError('artifact_invalid', 'Artifact does not contain a database backup')
}

async function resolveOperator(db: AppDatabase, email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    throw new RecoveryConfigurationError('operator_not_found', 'An operator email is required')
  }
  const [operator] = await db.select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1)
  if (!operator || !operator.active) {
    throw new RecoveryConfigurationError('operator_not_found', 'Recovery drill operator was not found')
  }
  if (!['owner', 'admin'].includes(operator.role)) {
    throw new RecoveryConfigurationError(
      'operator_not_authorized',
      'Only an owner or admin can run or review a recovery drill',
    )
  }
  return operator
}

async function insertEvidence(
  tx: DbTransaction,
  input: {
    drillId: string
    actorUserId: string
    status: 'passed' | 'failed'
    failureCode: string | null
    targetEnvironment: string
    artifactRef: string
    verification: VerificationResult
  },
) {
  if (input.verification.scopes.length > 0) {
    await tx.insert(recoveryDrillScopes).values(input.verification.scopes.map(scope => ({
      drillId: input.drillId,
      scope: scope.scope,
      expectedCount: scope.expectedCount,
      actualCount: scope.actualCount,
      expectedTotalMinor: scope.expectedTotalMinor,
      actualTotalMinor: scope.actualTotalMinor,
      currency: scope.currency,
      status: scope.status,
      mismatchCode: scope.mismatchCode,
    })))
  }

  await tx.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    action: input.status === 'passed' ? 'recovery.drill_completed' : 'recovery.drill_failed',
    entityType: 'recovery_drill',
    entityId: input.drillId,
    metadata: {
      status: input.status,
      failureCode: input.failureCode,
      targetEnvironment: input.targetEnvironment,
      artifactRef: input.artifactRef,
      scopeCount: input.verification.scopes.length,
      failedScopeCount: input.verification.scopes.filter(scope => scope.status === 'failed').length,
    },
  })
}

/** Creates a running evidence row before any artifact is produced. */
export async function beginRecoveryDrill(input: {
  operatorEmail: string
  startedAt: Date
  targetEnvironment: string
  artifactRef: string
}): Promise<string> {
  const db = await getDb()
  const operator = await resolveOperator(db, input.operatorEmail)
  const [row] = await db.insert(recoveryDrills).values({
    operatorUserId: operator.id,
    startedAt: input.startedAt,
    finishedAt: null,
    targetEnvironment: input.targetEnvironment,
    artifactRef: input.artifactRef,
    manifestChecksum: null,
    status: 'running',
    failureCode: null,
  }).returning()
  if (!row) throw new RecoveryExecutionError('internal_error', 'Could not create recovery drill evidence')
  return row.id
}

/** Transitions a running drill to its terminal state and stores scopes. */
export async function completeRecoveryDrill(input: {
  drillId: string
  finishedAt: Date
  manifestChecksum: string
  verification: VerificationResult
}): Promise<void> {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const [drill] = await tx.update(recoveryDrills).set({
      status: input.verification.status,
      finishedAt: input.finishedAt,
      manifestChecksum: input.manifestChecksum,
      failureCode: input.verification.failureCode,
    }).where(and(
      eq(recoveryDrills.id, input.drillId),
      eq(recoveryDrills.status, 'running'),
    )).returning()
    if (!drill) {
      throw new RecoveryExecutionError('configuration_error', 'Recovery drill is not in a running state')
    }

    await insertEvidence(tx, {
      drillId: drill.id,
      actorUserId: drill.operatorUserId,
      status: input.verification.status,
      failureCode: input.verification.failureCode,
      targetEnvironment: drill.targetEnvironment,
      artifactRef: drill.artifactRef,
      verification: input.verification,
    })
  })
}

/** Terminal failure for a drill that could not reach verification. */
export async function failRecoveryDrill(input: {
  drillId: string
  finishedAt: Date
  failureCode: RecoveryFailureCode
}): Promise<void> {
  const db = await getDb()
  await db.transaction(async (tx) => {
    const [drill] = await tx.update(recoveryDrills).set({
      status: 'failed',
      finishedAt: input.finishedAt,
      failureCode: input.failureCode,
    }).where(and(
      eq(recoveryDrills.id, input.drillId),
      eq(recoveryDrills.status, 'running'),
    )).returning()
    if (!drill) return

    await insertEvidence(tx, {
      drillId: drill.id,
      actorUserId: drill.operatorUserId,
      status: 'failed',
      failureCode: input.failureCode,
      targetEnvironment: drill.targetEnvironment,
      artifactRef: drill.artifactRef,
      verification: { status: 'failed', failureCode: 'scope_mismatch', scopes: [] },
    })
  })
}

/** Writes a complete terminal evidence record in one transaction. */
export async function recordDrillEvidence(input: DrillEvidenceInput): Promise<{ drillId: string }> {
  const db = await getDb()
  const operator = await resolveOperator(db, input.operatorEmail)

  const drillId = await db.transaction(async (tx) => {
    const [drill] = await tx.insert(recoveryDrills).values({
      operatorUserId: operator.id,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      targetEnvironment: input.targetEnvironment,
      artifactRef: input.artifactRef,
      manifestChecksum: input.manifestChecksum,
      status: input.verification.status,
      failureCode: input.verification.failureCode,
    }).returning()
    if (!drill) throw new RecoveryExecutionError('internal_error', 'Could not create recovery drill evidence')

    await insertEvidence(tx, {
      drillId: drill.id,
      actorUserId: operator.id,
      status: input.verification.status,
      failureCode: input.verification.failureCode,
      targetEnvironment: input.targetEnvironment,
      artifactRef: input.artifactRef,
      verification: input.verification,
    })
    return drill.id
  })

  return { drillId }
}

/**
 * Creates a consistent backup of the database and every stored attachment.
 * The source database is closed before the filesystem snapshot and left closed.
 */
export async function createRecoveryBackup(options: RecoveryBackupOptions): Promise<RecoveryBackupResult> {
  const root = resolveRecoveryRoot(options.recoveryRoot)
  const { artifactDir, artifactRef } = resolveInsideRecoveryRoot(root, options.targetDir)
  await ensureEmptyDirectory(artifactDir)

  const startedAt = options.now ?? new Date()
  const provider = options.sourceProvider ?? await defaultSourceProvider()
  const db = await getDb()
  const scopes = await collectScopeStats(db)
  const storedDocuments = await db.select({
    storageKey: attachments.storageKey,
    contentType: attachments.contentType,
  }).from(attachments).orderBy(asc(attachments.storageKey))

  const storage = options.sourceStorage ?? createRecoveryStorage({
    explicitRoot: options.sourceStorageRoot,
    envPrefix: '',
    defaultLocalRoot: defaultSourceStorageRoot(),
  })

  const sourceFingerprint = provider.fingerprint()
  await closeDb()

  try {
    const database = await provider.backup(artifactDir)
    const documents = await backupDocuments({
      storage,
      documents: storedDocuments,
      artifactDir,
    })

    const manifest: BackupManifest = {
      manifestVersion: RECOVERY_MANIFEST_VERSION,
      createdAt: startedAt.toISOString(),
      sourceEnvironment: sourceEnvironment(),
      dataFormatVersion: RECOVERY_DATA_FORMAT_VERSION,
      databaseChecksum: database.checksum,
      databaseBytes: database.bytes,
      documents,
      scopes,
      toolVersion: RECOVERY_TOOL_VERSION,
    }
    const written = await writeManifest(artifactDir, manifest)

    return {
      artifactDir,
      artifactRef,
      manifest: written.manifest,
      manifestChecksum: written.checksum,
      startedAt,
      finishedAt: new Date(),
      sourceFingerprint,
    }
  } finally {
    await provider.close()
  }
}

/**
 * Restores a backup into an isolated target, verifies artifact integrity and
 * compares record counts and financial totals with the manifest.
 */
export async function restoreRecoveryBackup(options: RecoveryRestoreOptions): Promise<RecoveryRestoreResult> {
  const root = resolveRecoveryRoot(options.recoveryRoot)
  const { artifactDir, artifactRef } = resolveInsideRecoveryRoot(root, options.artifactDir)
  const startedAt = new Date()
  const { manifest, checksum } = await readManifest(artifactDir)
  const artifactDatabaseKind = await kindOfArtifact(artifactDir)

  const provider = options.targetProvider ?? defaultTargetProvider({
    root,
    targetPgliteDir: options.targetPgliteDir ?? process.env.RECOVERY_TARGET_PGLITE_DIR,
    targetDatabaseUrl: options.targetDatabaseUrl ?? process.env.RECOVERY_TARGET_DATABASE_URL,
  })
  if (provider.kind !== artifactDatabaseKind) {
    throw new RecoveryConfigurationError(
      'configuration_error',
      'Restore target engine does not match the backup artifact',
    )
  }

  await verifyDatabaseArtifact(artifactDir, manifest, artifactDatabaseKind)

  assertIsolatedTarget({
    targetEnvironment: options.targetEnvironment ?? process.env.RECOVERY_TARGET_ENV,
    targetFingerprint: provider.fingerprint(),
    productionFingerprints: configuredProductionFingerprints(options.productionFingerprints),
    sourceFingerprint: options.sourceFingerprint ?? process.env.RECOVERY_SOURCE_FINGERPRINT,
  })

  const storage = options.targetStorage ?? createRecoveryStorage({
    explicitRoot: options.targetStorageRoot,
    envPrefix: 'RECOVERY_TARGET_',
    defaultLocalRoot: join(root, 'target/documents'),
  })

  try {
    await provider.restore(artifactDir)
    await restoreDocuments({ storage, entries: manifest.documents, artifactDir })
    await verifyRestoredDocuments({ storage, entries: manifest.documents })

    const restoredStats = await provider.collectStats()
    const verification = compareScopes(manifest.scopes, restoredStats)

    return {
      artifactRef,
      manifest,
      manifestChecksum: checksum,
      verification,
      startedAt,
      finishedAt: new Date(),
    }
  } finally {
    await provider.close()
  }
}

/**
 * Re-verifies an already restored isolated target against an existing artifact.
 * Read-only: it never restores, writes target data, or records evidence.
 */
export async function verifyRecoveryBackup(options: RecoveryRestoreOptions): Promise<RecoveryVerifyResult> {
  const root = resolveRecoveryRoot(options.recoveryRoot)
  const { artifactDir, artifactRef } = resolveInsideRecoveryRoot(root, options.artifactDir)
  const startedAt = new Date()
  const { manifest, checksum } = await readManifest(artifactDir)
  const artifactDatabaseKind = await kindOfArtifact(artifactDir)

  const provider = options.targetProvider ?? defaultTargetProvider({
    root,
    targetPgliteDir: options.targetPgliteDir ?? process.env.RECOVERY_TARGET_PGLITE_DIR,
    targetDatabaseUrl: options.targetDatabaseUrl ?? process.env.RECOVERY_TARGET_DATABASE_URL,
  })
  if (provider.kind !== artifactDatabaseKind) {
    throw new RecoveryConfigurationError(
      'configuration_error',
      'Verify target engine does not match the backup artifact',
    )
  }

  await verifyDatabaseArtifact(artifactDir, manifest, artifactDatabaseKind)

  assertIsolatedTarget({
    targetEnvironment: options.targetEnvironment ?? process.env.RECOVERY_TARGET_ENV,
    targetFingerprint: provider.fingerprint(),
    productionFingerprints: configuredProductionFingerprints(options.productionFingerprints),
    sourceFingerprint: options.sourceFingerprint ?? process.env.RECOVERY_SOURCE_FINGERPRINT,
  })

  if (!options.targetProvider && artifactDatabaseKind === 'pglite') {
    // PGlite creates a data directory on open. Verification must inspect an
    // existing restore, never create one, so fail before opening it.
    const targetDir = resolve(
      options.targetPgliteDir
        ?? process.env.RECOVERY_TARGET_PGLITE_DIR
        ?? join(root, 'target/pglite'),
    )
    const info = await stat(targetDir).catch(() => null)
    if (!info?.isDirectory()) {
      throw new RecoveryConfigurationError(
        'configuration_error',
        'The isolated PGlite target does not exist yet; run recovery:restore first',
      )
    }
  }

  const storage = options.targetStorage ?? createRecoveryStorage({
    explicitRoot: options.targetStorageRoot,
    envPrefix: 'RECOVERY_TARGET_',
    defaultLocalRoot: join(root, 'target/documents'),
  })

  try {
    await verifyRestoredDocuments({ storage, entries: manifest.documents })
    const restoredStats = await provider.collectStats()
    const verification = compareScopes(manifest.scopes, restoredStats)

    return {
      artifactRef,
      manifest,
      manifestChecksum: checksum,
      verification,
      startedAt,
      finishedAt: new Date(),
    }
  } finally {
    await provider.close()
  }
}

/**
 * The pilot gate: backup, isolated restore, verification, and append-only
 * evidence in one run.
 */
export async function runRecoveryDrill(options: DrillOptions): Promise<DrillResult> {
  const root = resolveRecoveryRoot(options.recoveryRoot)
  const marker = (options.targetEnvironment ?? process.env.RECOVERY_TARGET_ENV ?? '').trim().toLowerCase()
  if (marker === '') {
    throw new RecoveryIsolationError(
      'target_env_missing',
      'Isolation guard: an isolated target marker is required (RECOVERY_TARGET_ENV=isolated)',
    )
  }
  if (marker !== 'isolated') {
    throw new RecoveryIsolationError(
      'target_env_not_isolated',
      'Isolation guard: restore target must be isolated',
    )
  }

  const { artifactDir, artifactRef } = resolveInsideRecoveryRoot(root, options.targetDir)
  const startedAt = options.now ?? new Date()
  const drillId = await beginRecoveryDrill({
    operatorEmail: options.operatorEmail,
    startedAt,
    targetEnvironment: 'isolated',
    artifactRef,
  })

  try {
    const backup = await createRecoveryBackup({
      targetDir: artifactDir,
      recoveryRoot: root,
      sourceProvider: options.sourceProvider,
      sourceStorage: options.sourceStorage,
      sourceStorageRoot: options.sourceStorageRoot,
      now: startedAt,
    })

    const restored = await restoreRecoveryBackup({
      artifactDir: backup.artifactDir,
      recoveryRoot: root,
      targetEnvironment: marker,
      targetPgliteDir: options.targetPgliteDir,
      targetDatabaseUrl: options.targetDatabaseUrl,
      targetProvider: options.targetProvider,
      targetStorage: options.targetStorage,
      targetStorageRoot: options.targetStorageRoot,
      sourceFingerprint: backup.sourceFingerprint,
      productionFingerprints: options.productionFingerprints,
    })

    await completeRecoveryDrill({
      drillId,
      finishedAt: restored.finishedAt,
      manifestChecksum: restored.manifestChecksum,
      verification: restored.verification,
    })

    return {
      drillId,
      status: restored.verification.status,
      artifactRef: backup.artifactRef,
      manifestChecksum: restored.manifestChecksum,
      startedAt: startedAt.toISOString(),
      finishedAt: restored.finishedAt.toISOString(),
      scopes: restored.verification.scopes,
      failureCode: restored.verification.failureCode,
      targetEnvironment: 'isolated',
    }
  } catch (error) {
    const failureCode = safeFailureCode(error)
    try {
      await getDb()
      await failRecoveryDrill({ drillId, finishedAt: new Date(), failureCode })
    } catch {
      // Evidence failure must never mask the original backup or restore error.
    }
    throw error
  } finally {
    // The source connection was closed for the snapshot; leave it usable.
    await getDb().catch(() => undefined)
  }
}
