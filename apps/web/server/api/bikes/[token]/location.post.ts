import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, motorcycles, locationAssignments, auditEvents } from '@book-moto/db'
import { resolveBikeLocator } from '../../../utils/bike-locator'

const bodySchema = z.object({
  location: z.string().trim().min(2).max(120),
  note: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid location payload' })

  const targetLocation = parsed.data.location
  if (!canAccessLocation(user, targetLocation)) {
    throw createError({ statusCode: 403, statusMessage: 'Location is outside your scope' })
  }

  const db = await getDb()
  try {
    const locator = await resolveBikeLocator(rawToken)
    if (!locator || !canAccessLocation(user, locator.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    const assignment = await db.transaction(async (tx) => {
      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, locator.motorcycleId)).limit(1).for('update')
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
      if (bike.location === targetLocation) throw createError({ statusCode: 409, statusMessage: 'Motorcycle is already at this location' })

      const startedAt = new Date()
      await tx.update(locationAssignments).set({ endedAt: startedAt }).where(and(
        eq(locationAssignments.motorcycleId, bike.id),
        isNull(locationAssignments.endedAt),
      ))

      const [row] = await tx.insert(locationAssignments).values({
        motorcycleId: bike.id,
        location: targetLocation,
        note: parsed.data.note || null,
        assignedByUserId: user.id,
        startedAt,
      }).returning()
      if (!row) throw createError({ statusCode: 500, statusMessage: 'Could not record location move' })

      await tx.update(motorcycles).set({ location: targetLocation, updatedAt: startedAt }).where(eq(motorcycles.id, bike.id))

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'bike.location_changed',
        entityType: 'motorcycle',
        entityId: bike.id,
        location: targetLocation,
        metadata: { from: bike.location, to: targetLocation, note: parsed.data.note || null, assetCode: bike.assetCode },
      })

      return row
    })

    return {
      moved: true,
      assignment: {
        ...assignment,
        startedAt: assignment.startedAt.toISOString(),
        endedAt: assignment.endedAt ? assignment.endedAt.toISOString() : null,
        createdAt: assignment.createdAt.toISOString(),
      },
    }
  } catch (error) {
    throwApiError(error)
  }
})
