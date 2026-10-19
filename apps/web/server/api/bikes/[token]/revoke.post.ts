import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, motorcycles, qrIdentities, qrPayloads, auditEvents } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Revocation reason is required' })
  }

  const db = await getDb()
  const tokenHash = hashLocatorToken(token)

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          motorcycleId: motorcycles.id,
          location: motorcycles.location,
          payloadId: qrPayloads.id,
          version: qrPayloads.version,
        })
        .from(qrPayloads)
        .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
        .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
        .where(and(eq(qrPayloads.tokenHash, tokenHash), eq(qrPayloads.status, 'active')))
        .limit(1)

      if (!row || !canAccessLocation(user, row.location)) {
        throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
      }

      await tx
        .update(qrPayloads)
        .set({ status: 'revoked', retiredAt: new Date() })
        .where(eq(qrPayloads.id, row.payloadId))

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'qr.payload_revoked',
        entityType: 'motorcycle',
        entityId: row.motorcycleId,
        location: row.location,
        reason: parsed.data.reason,
        metadata: {
          payloadId: row.payloadId,
          version: row.version,
        },
      })
    })

    return { revoked: true }
  } catch (error) {
    throwApiError(error)
  }
})
