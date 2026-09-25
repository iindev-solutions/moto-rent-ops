import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Pool } from 'pg'
import * as schema from './schema'

export type AppDatabase = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>

let pool: Pool | undefined
let pglite: PGlite | undefined
let dbPromise: Promise<AppDatabase> | undefined
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')
const usePostgres = process.env.DATABASE_PROVIDER === 'postgres' || Boolean(process.env.DATABASE_URL)
const autoMigratePglite = process.env.PGLITE_AUTO_MIGRATE !== 'false'

async function createDatabase(): Promise<AppDatabase> {
  if (usePostgres) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgres')
    }

    pool = new Pool({ connectionString, max: 10 })
    return drizzleNodePostgres(pool, { schema })
  }

  const dataDirectory = process.env.PGLITE_DATA_DIR || resolve(process.cwd(), '.data/pglite')
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
