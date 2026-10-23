import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import { getDb, outboxEvents } from '@book-moto/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireOutboxAdmin(user)

  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status.trim() : ''
  const eventType = typeof query.eventType === 'string' ? query.eventType.trim() : ''
  const aggregateId = typeof query.aggregateId === 'string' ? query.aggregateId.trim() : ''
  if (status && !OUTBOX_STATUSES.includes(status as typeof OUTBOX_STATUSES[number])) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid outbox status' })
  }
  if (eventType.length > 80) throw createError({ statusCode: 400, statusMessage: 'Invalid event type' })
  if (aggregateId && !UUID_PATTERN.test(aggregateId)) throw createError({ statusCode: 400, statusMessage: 'Invalid aggregate id' })
  const { limit, offset } = readPagination(event)

  const filters: SQL[] = []
  if (status) filters.push(eq(outboxEvents.status, status))
  if (eventType) filters.push(eq(outboxEvents.eventType, eventType))
  if (aggregateId) filters.push(eq(outboxEvents.aggregateId, aggregateId))
  const where = filters.length > 0 ? and(...filters) : undefined

  const db = await getDb()
  try {
    const [totalRow] = await db.select({ value: count() }).from(outboxEvents).where(where)
    const total = Number(totalRow?.value ?? 0)
    const events = await db.select()
      .from(outboxEvents)
      .where(where)
      .orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id))
      .limit(limit)
      .offset(offset)

    return {
      events: events.map(serializeOutboxEvent),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    }
  } catch (error) {
    throwApiError(error)
  }
})
