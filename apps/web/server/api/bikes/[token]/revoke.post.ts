import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, qrPayloads, auditEvents } from '@book-moto/db'
import { resolveBikeLocator } from '../../../utils/bike-locator'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Revocation reason is required' })
  }

  const db = await getDb()

  try {
    const locator = await resolveBikeLocator(rawToken)
    if (!locator || !canAccessLocation(user, locator.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    await db.transaction(async (tx) => {
      const [active] = await tx
        .select({ id: qrPayloads.id, version: qrPayloads.version })
        .from(qrPayloads)
        .where(and(eq(qrPayloads.id, locator.payloadId), eq(qrPayloads.status, 'active')))
        .limit(1)
        .for('update')

      if (!active) {
        throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
      }

      await tx
        .update(qrPayloads)
        .set({ status: 'revoked', retiredAt: new Date() })
        .where(eq(qrPayloads.id, active.id))

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'qr.payload_revoked',
        entityType: 'motorcycle',
        entityId: locator.motorcycleId,
        location: locator.location,
        reason: parsed.data.reason,
        metadata: {
          payloadId: active.id,
          version: active.version,
        },
      })
    })

    return { revoked: true }
  } catch (error) {
    throwApiError(error)
  }
})
