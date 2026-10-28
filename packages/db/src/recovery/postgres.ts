import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { AppDatabase } from '../client'
import * as schema from '../schema'
import { sha256File } from './manifest'
import { collectScopeStats } from './verify'
import {
  RecoveryConfigurationError,
  RecoveryExecutionError,
  type DatabaseArtifact,
  type RecoveryProvider,
  type ScopeStats,
} from './types'

const execFileAsync = promisify(execFile)

export interface PostgresProviderOptions {
  databaseUrl: string
  /** Existing connection for the source database; omit for a restore target. */
  db?: AppDatabase
}

function fingerprintOf(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl)
    return `postgres:${url.host}${url.pathname}`
  } catch {
    // Never expose credentials: fall back to a short digest of the raw URL.
    return `postgres:sha256:${createHash('sha256').update(databaseUrl).digest('hex').slice(0, 16)}`
  }
}

class PostgresRecoveryProvider implements RecoveryProvider {
  readonly kind = 'postgres' as const
  private readonly databaseUrl: string
  private readonly existingDb?: AppDatabase
  private pool?: Pool

  constructor(options: PostgresProviderOptions) {
    if (!options.databaseUrl) {
      throw new RecoveryConfigurationError('configuration_error', 'A PostgreSQL connection URL is required')
    }
    this.databaseUrl = options.databaseUrl
    this.existingDb = options.db
  }

  fingerprint() {
    return fingerprintOf(this.databaseUrl)
  }

  async backup(artifactDir: string): Promise<DatabaseArtifact> {
    await mkdir(artifactDir, { recursive: true })
    const dumpPath = join(artifactDir, 'database.dump')
    try {
      await execFileAsync('pg_dump', [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        dumpPath,
        this.databaseUrl,
      ])
    } catch (error) {
      throw new RecoveryExecutionError('backup_failed', `pg_dump failed with code ${exitCode(error)}`)
    }
    const info = await stat(dumpPath)
    return { checksum: await sha256File(dumpPath), bytes: info.size }
  }

  async restore(artifactDir: string): Promise<void> {
    const dumpPath = join(artifactDir, 'database.dump')
    try {
      await stat(dumpPath)
    } catch {
      throw new RecoveryConfigurationError('artifact_invalid', 'Database dump is missing from the artifact')
    }
    try {
      await execFileAsync('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        this.databaseUrl,
        dumpPath,
      ])
    } catch (error) {
      throw new RecoveryExecutionError('restore_failed', `pg_restore failed with code ${exitCode(error)}`)
    }
  }

  async collectStats(): Promise<ScopeStats[]> {
    if (this.existingDb) return collectScopeStats(this.existingDb)

    this.pool = new Pool({ connectionString: this.databaseUrl, max: 2 })
    const db = drizzle(this.pool, { schema })
    const stats = await collectScopeStats(db)
    await this.pool.end()
    this.pool = undefined
    return stats
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = undefined
    }
  }
}

function exitCode(error: unknown) {
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'number') {
    return (error as { code: number }).code
  }
  return 'unknown'
}

export function createPostgresProvider(options: PostgresProviderOptions): RecoveryProvider {
  return new PostgresRecoveryProvider(options)
}
