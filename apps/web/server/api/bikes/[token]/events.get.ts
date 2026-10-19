import { and, desc, eq } from 'drizzle-orm'
import { getDb, motorcycles, qrIdentities, qrPayloads, auditEvents, users } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const db = await getDb()
  const tokenHash = hashLocatorToken(token)

  try {
    const [bike] = await db
      .select({ id: motorcycles.id, location: motorcycles.location })
      .from(qrPayloads)
      .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
      .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
      .where(and(eq(qrPayloads.tokenHash, tokenHash), eq(qrPayloads.status, 'active')))
      .limit(1)

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
      .where(and(eq(auditEvents.entityType, 'motorcycle'), eq(auditEvents.entityId, bike.id)))
      .orderBy(desc(auditEvents.createdAt))
      .limit(50)

    return { events }
  } catch (error) {
    throwApiError(error)
  }
})
