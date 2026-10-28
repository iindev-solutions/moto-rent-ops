import { getDb } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireRecoveryAdmin(user)

  const db = await getDb()
  return await getRecoveryStatus(db)
})
