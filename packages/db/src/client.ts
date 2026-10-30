import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { Pool } from 'pg'
import * as schema from './schema'

export type AppDatabase = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>

/** Transaction handle passed to `db.transaction()` callbacks. */
export type DbTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

let pool: Pool | undefined
let pglite: PGlite | undefined
let dbPromise: Promise<AppDatabase> | undefined
function findRepoRoot(start: string) {
  let current = resolve(start)
  while (true) {
    if (existsSync(join(current, 'packages/db/migrations')) && existsSync(join(current, 'package.json'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return resolve(start)
    }
    current = parent
  }
}

const repoRoot = findRepoRoot(process.cwd())
const migrationsFolder = resolve(repoRoot, 'packages/db/migrations')
const defaultPgliteDirectory = resolve(repoRoot, 'packages/db/.data/pglite')

/** Repository root resolved from the current working directory. */
export const repositoryRoot = repoRoot

/** Absolute PGlite data directory, matching the provider selection in `getDb()`. */
export function resolvePgliteDataDir() {
  const configured = process.env.PGLITE_DATA_DIR
  return configured && isAbsolute(configured) ? configured : defaultPgliteDirectory
}

// Read these lazily: CLI scripts load dotenv after their static imports have
// been evaluated, so module-level env reads would silently use PGlite instead
// of the configured PostgreSQL database.
function usePostgresProvider() {
  return process.env.DATABASE_PROVIDER === 'postgres' || Boolean(process.env.DATABASE_URL)
}

function shouldAutoMigratePglite() {
  return process.env.PGLITE_AUTO_MIGRATE !== 'false'
}

async function createDatabase(): Promise<AppDatabase> {
  if (usePostgresProvider()) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgres')
    }

    pool = new Pool({ connectionString, max: 10 })
    return drizzleNodePostgres(pool, { schema })
  }

  const dataDirectory = resolvePgliteDataDir()
  mkdirSync(dirname(dataDirectory), { recursive: true })
  pglite = new PGlite(dataDirectory)
  const db = drizzlePglite(pglite, { schema })
  if (shouldAutoMigratePglite()) {
    await migratePglite(db, { migrationsFolder })
  }
  return db
}

export function getDb() {
  dbPromise ??= createDatabase()
  return dbPromise
}

export async function migrateDatabase() {
  if (usePostgresProvider()) {
    const db = await getDb()
    await migrateNodePostgres(db as NodePgDatabase<typeof schema>, { migrationsFolder })
    return
  }

  const db = await getDb()
  await migratePglite(db as PgliteDatabase<typeof schema>, { migrationsFolder })
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
  if (pglite) {
    await pglite.close()
    pglite = undefined
  }
  dbPromise = undefined
}
