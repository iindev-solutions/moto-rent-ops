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
    }).from(incidents).leftJoin(motorcycles, eq(incidents.motorcycleId, motorcycles.id)).orderBy(desc(incidents.createdAt), desc(incidents.id))

    const visible = rows.filter(row => row.motorcycleId === null || canAccessLocation(user, row.location))
    const page = paginate(visible, readPagination(event))
    return {
      incidents: page.items.map(({ location: _location, ...r }) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
    }
  } catch (error) {
    throwApiError(error)
  }
})
