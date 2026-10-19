import { sql } from 'drizzle-orm'
import { getDb } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')

  try {
    const db = await getDb()
    await db.execute(sql`select 1`)
    return {
      status: 'ok',
      service: 'book-moto-web',
      timestamp: new Date().toISOString(),
    }
  } catch {
    setResponseStatus(event, 503)
    return {
      status: 'degraded',
      service: 'book-moto-web',
      timestamp: new Date().toISOString(),
    }
  }
})
