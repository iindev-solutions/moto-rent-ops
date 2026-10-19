import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, maintenanceOrders, motorcycles, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  motorcycleId: z.string().uuid(),
  type: z.string().trim().min(2).max(64).default('service'),
  status: z.enum(['planned', 'due', 'in_progress', 'completed', 'cancelled']).default('planned'),
  dueDate: z.string().datetime().optional(),
  costMinor: z.number().int().min(0).default(0),
  currency: z.string().trim().length(3).default('VND'),
  notes: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid maintenance payload' })

  const db = await getDb()
  try {
    const [bike] = await db.select().from(motorcycles).where(eq(motorcycles.id, parsed.data.motorcycleId)).limit(1)
    if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })

    const order = await db.transaction(async (tx) => {
      const [order] = await tx.insert(maintenanceOrders).values({
        motorcycleId: parsed.data.motorcycleId,
        type: parsed.data.type,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        costMinor: parsed.data.costMinor,
        currency: parsed.data.currency,
        notes: parsed.data.notes || null,
      }).returning()

      if (!order) throw createError({ statusCode: 500, statusMessage: 'Could not create maintenance order' })

      if (parsed.data.status === 'in_progress' && bike.status !== 'rented' && bike.status !== 'reserved') {
        await tx.update(motorcycles).set({ status: 'maintenance', nextAction: 'Service in progress', updatedAt: new Date() }).where(eq(motorcycles.id, parsed.data.motorcycleId))
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'maintenance.created',
        entityType: 'maintenance_order',
        entityId: order.id,
        metadata: { motorcycleId: parsed.data.motorcycleId, type: order.type },
      })

      return order
    })

    return { order }
  } catch (error) {
    throwApiError(error)
  }
})
