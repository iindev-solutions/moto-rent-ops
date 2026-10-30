import { eq } from 'drizzle-orm'
import { auditEvents, getDb, outboxEvents } from '@book-moto/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireOutboxAdmin(user)

  const id = getRouterParam(event, 'id')
  if (!id || !UUID_PATTERN.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid outbox event id' })

  const db = await getDb()
  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(outboxEvents).where(eq(outboxEvents.id, id)).limit(1).for('update')
      if (!row) throw createError({ statusCode: 404, statusMessage: 'Outbox event not found' })
      if (row.status !== 'dead_letter') throw createError({ statusCode: 409, statusMessage: 'Only dead-letter events can be replayed' })

      const now = new Date()
      const [next] = await tx.update(outboxEvents).set({
        status: 'pending',
        attempts: 0,
        replayEpoch: row.replayEpoch + 1,
        nextAttemptAt: now,
        lockedAt: null,
        lastError: null,
        sentAt: null,
        updatedAt: now,
      }).where(eq(outboxEvents.id, id)).returning()

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'outbox.event_replayed',
        entityType: 'outbox_event',
        entityId: id,
        metadata: {
          eventType: row.eventType,
          previousEpoch: row.replayEpoch,
          previousAttempts: row.attempts,
          previousError: row.lastError,
        },
      })
      return next
    })

    return { event: serializeOutboxEvent(updated!) }
  } catch (error) {
    throwApiError(error)
  }
})
