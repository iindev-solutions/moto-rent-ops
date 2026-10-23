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
      if (row.status === 'dead_letter') throw createError({ statusCode: 409, statusMessage: 'Dead-letter event must be replayed' })
      if (row.status !== 'pending') throw createError({ statusCode: 409, statusMessage: 'Only pending events can be retried' })

      const now = new Date()
      const [next] = await tx.update(outboxEvents).set({
        nextAttemptAt: now,
        updatedAt: now,
      }).where(eq(outboxEvents.id, id)).returning()

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'outbox.event_retried',
        entityType: 'outbox_event',
        entityId: id,
        metadata: { eventType: row.eventType, attempts: row.attempts },
      })
      return next
    })

    return { event: serializeOutboxEvent(updated!) }
  } catch (error) {
    throwApiError(error)
  }
})
