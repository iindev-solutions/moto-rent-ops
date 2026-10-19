import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, maintenanceOrders, motorcycles, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  status: z.enum(['planned', 'due', 'in_progress', 'completed', 'cancelled']),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Maintenance id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid status' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(maintenanceOrders).where(eq(maintenanceOrders.id, id)).limit(1).for('update')
      if (!order) throw createError({ statusCode: 404, statusMessage: 'Maintenance order not found' })

      const [bike] = await tx.select({ id: motorcycles.id, status: motorcycles.status, location: motorcycles.location }).from(motorcycles).where(eq(motorcycles.id, order.motorcycleId)).limit(1)
      if (!bike) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })
      if (!canAccessLocation(user, bike.location)) {
        throw createError({ statusCode: 403, statusMessage: 'Maintenance order is outside your location scope' })
      }

      await tx.update(maintenanceOrders).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(maintenanceOrders.id, id))

      if (parsed.data.status === 'completed' || parsed.data.status === 'cancelled') {
        if (bike.status === 'maintenance' || bike.status === 'inspection') {
          await tx.update(motorcycles).set({ status: 'available', nextAction: 'Print QR label', updatedAt: new Date() }).where(eq(motorcycles.id, order.motorcycleId))
        }
      } else if (parsed.data.status === 'in_progress') {
        if (bike.status !== 'rented' && bike.status !== 'reserved') {
          await tx.update(motorcycles).set({ status: 'maintenance', nextAction: 'Service in progress', updatedAt: new Date() }).where(eq(motorcycles.id, order.motorcycleId))
        }
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'maintenance.status_changed',
        entityType: 'maintenance_order',
        entityId: id,
        metadata: { status: parsed.data.status, motorcycleStatus: bike.status },
      })
    })

    return { updated: true }
  } catch (error) {
    throwApiError(error)
  }
})
