import { desc } from 'drizzle-orm'
import { getDb, legacyImportBatches } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireOwnerOrAdmin(user)

  const db = await getDb()
  const batches = await db
    .select()
    .from(legacyImportBatches)
    .orderBy(desc(legacyImportBatches.createdAt))
    .limit(50)

  return { batches }
})
