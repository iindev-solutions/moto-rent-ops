import { and, desc, eq } from 'drizzle-orm'
import { getDb, motorcycles, locationAssignments, qrIdentities, qrPayloads, users } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'
import { canAccessLocation, requireAppUser } from '../../../../server/utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

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
    if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

    const rows = await db
      .select({
        id: locationAssignments.id,
        location: locationAssignments.location,
        note: locationAssignments.note,
        startedAt: locationAssignments.startedAt,
        endedAt: locationAssignments.endedAt,
        actorName: users.name,
      })
      .from(locationAssignments)
      .leftJoin(users, eq(locationAssignments.assignedByUserId, users.id))
      .where(eq(locationAssignments.motorcycleId, bike.id))
      .orderBy(desc(locationAssignments.startedAt))
      .limit(50)

    return {
      locations: rows.map(row => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
