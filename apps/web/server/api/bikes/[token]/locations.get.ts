import { desc, eq } from 'drizzle-orm'
import { getDb, locationAssignments, users } from '@book-moto/db'
import { resolveBikeLocator } from '../../../utils/bike-locator'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

  const db = await getDb()
  try {
    const bike = await resolveBikeLocator(rawToken)
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
      .where(eq(locationAssignments.motorcycleId, bike.motorcycleId))
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
