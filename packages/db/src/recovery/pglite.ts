import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppDatabase } from '../client'
import * as schema from '../schema'
import { hashDirectory } from './manifest'
import { collectScopeStats } from './verify'
import {
  RecoveryConfigurationError,
  type DatabaseArtifact,
  type RecoveryProvider,
  type ScopeStats,
} from './types'

export interface PgliteProviderOptions {
  /** Absolute path of the PGlite data directory. */
  dataDir: string
  /** Existing connection for the source database; omit for a restore target. */
  db?: AppDatabase
}

async function prepareEmptyDirectory(target: string) {
  try {
    const entries = await readdir(target)
    if (entries.length > 0) {
      throw new RecoveryConfigurationError(
        'target_not_empty',
        `Recovery target is not empty: ${target}`,
      )
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await mkdir(target, { recursive: true })
  }
}

async function copyDirectoryContents(source: string, target: string) {
  const info = await stat(source)
  if (!info.isDirectory()) {
    throw new RecoveryConfigurationError('artifact_invalid', 'Database artifact is not a directory')
  }
  await prepareEmptyDirectory(target)
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'postmaster.pid') continue
    await cp(join(source, entry.name), join(target, entry.name), {
      recursive: entry.isDirectory(),
      force: false,
      errorOnExist: false,
    })
  }
}

class PgliteRecoveryProvider implements RecoveryProvider {
  readonly kind = 'pglite' as const
  private readonly dataDir: string
  private readonly existingDb?: AppDatabase
  private client?: PGlite

  constructor(options: PgliteProviderOptions) {
    this.dataDir = resolve(options.dataDir)
    this.existingDb = options.db
  }

  fingerprint() {
    return `pglite:${this.dataDir.replaceAll('\\', '/')}`
  }

  async backup(artifactDir: string): Promise<DatabaseArtifact> {
    const target = join(artifactDir, 'database')
    await copyDirectoryContents(this.dataDir, target)
    return hashDirectory(target)
  }

  async restore(artifactDir: string): Promise<void> {
    const source = join(artifactDir, 'database')
    await copyDirectoryContents(source, this.dataDir)
  }

  async collectStats(): Promise<ScopeStats[]> {
    if (this.existingDb) return collectScopeStats(this.existingDb)

    this.client = new PGlite(this.dataDir)
    const db = drizzle(this.client, { schema })
    const stats = await collectScopeStats(db)
    await this.client.close()
    this.client = undefined
    return stats
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = undefined
    }
  }
}

export function createPgliteProvider(options: PgliteProviderOptions): RecoveryProvider {
  return new PgliteRecoveryProvider(options)
}
