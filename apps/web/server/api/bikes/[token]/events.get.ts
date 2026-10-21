import { and, desc, eq } from 'drizzle-orm'
import { getDb, auditEvents, users } from '@book-moto/db'
import { resolveBikeLocator } from '../../../utils/bike-locator'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const db = await getDb()

  try {
    const bike = await resolveBikeLocator(rawToken)
    if (!bike || !canAccessLocation(user, bike.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    const events = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        reason: auditEvents.reason,
        createdAt: auditEvents.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorUserId, users.id))
      .where(and(eq(auditEvents.entityType, 'motorcycle'), eq(auditEvents.entityId, bike.motorcycleId)))
      .orderBy(desc(auditEvents.createdAt))
      .limit(50)

    return { events }
  } catch (error) {
    throwApiError(error)
  }
})
