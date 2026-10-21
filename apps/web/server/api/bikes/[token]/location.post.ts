import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, motorcycles, locationAssignments, qrIdentities, qrPayloads, auditEvents } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'
import { canAccessLocation, requireAppUser } from '../../../../server/utils/auth'

const bodySchema = z.object({
  location: z.string().trim().min(2).max(120),
  note: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid location payload' })

  const targetLocation = parsed.data.location
  if (!canAccessLocation(user, targetLocation)) {
    throw createError({ statusCode: 403, statusMessage: 'Location is outside your scope' })
  }

  const db = await getDb()
  const tokenHash = hashLocatorToken(token)
  try {
    const assignment = await db.transaction(async (tx) => {
      const [resolved] = await tx
        .select({ id: motorcycles.id })
        .from(qrPayloads)
        .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
        .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
        .where(and(eq(qrPayloads.tokenHash, tokenHash), eq(qrPayloads.status, 'active')))
        .limit(1)
      if (!resolved) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, resolved.id)).limit(1).for('update')
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
