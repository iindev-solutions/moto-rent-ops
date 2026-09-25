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
const usePostgres = process.env.DATABASE_PROVIDER === 'postgres' || Boolean(process.env.DATABASE_URL)
const autoMigratePglite = process.env.PGLITE_AUTO_MIGRATE !== 'false'
const defaultPgliteDirectory = resolve(repoRoot, 'packages/db/.data/pglite')

async function createDatabase(): Promise<AppDatabase> {
  if (usePostgres) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgres')
    }

    pool = new Pool({ connectionString, max: 10 })
    return drizzleNodePostgres(pool, { schema })
  }

  const configuredPgliteDirectory = process.env.PGLITE_DATA_DIR
  const dataDirectory = configuredPgliteDirectory && isAbsolute(configuredPgliteDirectory)
    ? configuredPgliteDirectory
    : defaultPgliteDirectory
  mkdirSync(dirname(dataDirectory), { recursive: true })
  pglite = new PGlite(dataDirectory)
  const db = drizzlePglite(pglite, { schema })
  if (autoMigratePglite) {
    await migratePglite(db, { migrationsFolder })
  }
  return db
}

export function getDb() {
  dbPromise ??= createDatabase()
  return dbPromise
}

export async function migrateDatabase() {
  if (usePostgres) {
    const db = await getDb()
    await migrateNodePostgres(db as NodePgDatabase<typeof schema>, { migrationsFolder })
    return
  }

  await getDb()
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
