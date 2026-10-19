import { desc, eq } from 'drizzle-orm'
import { getDb, incidents, motorcycles } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const db = await getDb()
  try {
    const rows = await db.select({
      id: incidents.id,
      title: incidents.title,
      description: incidents.description,
      status: incidents.status,
      priority: incidents.priority,
      motorcycleId: incidents.motorcycleId,
      assetCode: motorcycles.assetCode,
      model: motorcycles.model,
      location: motorcycles.location,
      createdAt: incidents.createdAt,
    }).from(incidents).leftJoin(motorcycles, eq(incidents.motorcycleId, motorcycles.id)).orderBy(desc(incidents.createdAt))

    const visible = rows.filter(row => row.motorcycleId === null || canAccessLocation(user, row.location))
    return { incidents: visible.map(({ location: _location, ...r }) => ({ ...r, createdAt: r.createdAt.toISOString() })) }
  } catch (error) {
    throwApiError(error)
  }
})
