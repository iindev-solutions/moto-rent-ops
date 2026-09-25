import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

let pool: Pool | undefined

export function getDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  pool ??= new Pool({ connectionString, max: 10 })
  return drizzle(pool, { schema })
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}
