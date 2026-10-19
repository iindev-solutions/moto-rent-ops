import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, incidents, auditEvents, motorcycles } from '@book-moto/db'

const bodySchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  motorcycleId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid incident payload' })

  const db = await getDb()
  try {
    if (parsed.data.motorcycleId) {
      const [bike] = await db.select({ id: motorcycles.id, location: motorcycles.location }).from(motorcycles).where(eq(motorcycles.id, parsed.data.motorcycleId)).limit(1)
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })
    }

    const incident = await db.transaction(async (tx) => {
      const [row] = await tx.insert(incidents).values({
        title: parsed.data.title,
        description: parsed.data.description || null,
        motorcycleId: parsed.data.motorcycleId || null,
        priority: parsed.data.priority,
      }).returning()

      if (!row) throw createError({ statusCode: 500, statusMessage: 'Could not create incident' })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'incident.created',
        entityType: 'incident',
        entityId: row.id,
        metadata: { title: row.title, priority: row.priority },
      })

      return row
    })

    return { incident }
  } catch (error) {
    throwApiError(error)
  }
})
