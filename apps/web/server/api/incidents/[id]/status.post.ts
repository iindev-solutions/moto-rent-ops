import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, incidents, motorcycles, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'closed']),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Incident id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid status' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [incident] = await tx
        .select({ id: incidents.id, status: incidents.status, motorcycleId: incidents.motorcycleId })
        .from(incidents)
        .where(eq(incidents.id, id))
        .limit(1)
        .for('update')
      if (!incident) throw createError({ statusCode: 404, statusMessage: 'Incident not found' })

      if (incident.motorcycleId) {
        const [bike] = await tx.select({ location: motorcycles.location }).from(motorcycles).where(eq(motorcycles.id, incident.motorcycleId)).limit(1)
        if (bike && !canAccessLocation(user, bike.location)) {
          throw createError({ statusCode: 403, statusMessage: 'Incident is outside your location scope' })
        }
      }

      await tx.update(incidents).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(incidents.id, id))
      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'incident.status_changed',
        entityType: 'incident',
        entityId: id,
        metadata: { status: parsed.data.status, previousStatus: incident.status },
      })
    })

    return { updated: true }
  } catch (error) {
    throwApiError(error)
  }
})

