import { desc, eq } from 'drizzle-orm'
import { getDb, maintenanceOrders, motorcycles } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const db = await getDb()
  try {
    const rows = await db.select({
      id: maintenanceOrders.id,
      type: maintenanceOrders.type,
      status: maintenanceOrders.status,
      dueDate: maintenanceOrders.dueDate,
      costMinor: maintenanceOrders.costMinor,
      currency: maintenanceOrders.currency,
      notes: maintenanceOrders.notes,
      motorcycleId: maintenanceOrders.motorcycleId,
      assetCode: motorcycles.assetCode,
      model: motorcycles.model,
      location: motorcycles.location,
      createdAt: maintenanceOrders.createdAt,
    }).from(maintenanceOrders).leftJoin(motorcycles, eq(maintenanceOrders.motorcycleId, motorcycles.id)).orderBy(desc(maintenanceOrders.createdAt))

    const visible = rows.filter(row => canAccessLocation(user, row.location))
    return { orders: visible.map(({ location: _location, ...r }) => ({ ...r, dueDate: r.dueDate ? r.dueDate.toISOString() : null, createdAt: r.createdAt.toISOString() })) }
  } catch (error) {
    throwApiError(error)
  }
})
