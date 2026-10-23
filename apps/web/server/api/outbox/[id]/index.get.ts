import { asc, eq } from 'drizzle-orm'
import { getDb, outboxAttempts, outboxEvents } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireOutboxAdmin(user)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Outbox event id is required' })

  const db = await getDb()
  try {
    const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)).limit(1)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Outbox event not found' })

    const attempts = await db.select()
      .from(outboxAttempts)
      .where(eq(outboxAttempts.eventId, id))
      .orderBy(asc(outboxAttempts.createdAt), asc(outboxAttempts.epoch), asc(outboxAttempts.attempt))

    return {
      event: serializeOutboxEvent(row),
      attempts: attempts.map(serializeOutboxAttempt),
    }
  } catch (error) {
    throwApiError(error)
  }
})
