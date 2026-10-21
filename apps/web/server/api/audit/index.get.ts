import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import { auditEvents, getDb } from '@book-moto/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  if (!['owner', 'admin'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner access required' })
  }

  const query = getQuery(event)
  const action = typeof query.action === 'string' ? query.action.trim() : ''
  const entityId = typeof query.entityId === 'string' ? query.entityId.trim() : ''
  if (action.length > 120) throw createError({ statusCode: 400, statusMessage: 'Invalid action filter' })
  if (entityId && !UUID_PATTERN.test(entityId)) throw createError({ statusCode: 400, statusMessage: 'Invalid entity id' })
  const { limit, offset } = readPagination(event)

  const filters: SQL[] = []
  if (action) filters.push(eq(auditEvents.action, action))
  if (entityId) filters.push(eq(auditEvents.entityId, entityId))
  const where = filters.length > 0 ? and(...filters) : undefined

  const db = await getDb()
  try {
    const [totalRow] = await db.select({ value: count() }).from(auditEvents).where(where)
    const total = Number(totalRow?.value ?? 0)
    const events = await db
      .select()
      .from(auditEvents)
      .where(where)
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit)
      .offset(offset)

    return {
      events: events.map(row => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        location: row.location,
        reason: row.reason,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    }
  } catch (error) {
    throwApiError(error)
  }
})
