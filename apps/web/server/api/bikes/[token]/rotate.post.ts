import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, motorcycles, qrIdentities, qrPayloads, auditEvents } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { encryptLocatorToken, hashLocatorToken } from '@book-moto/db/crypto'
import { randomUUID } from 'node:crypto'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rotation payload' })
  }

  const db = await getDb()
  const tokenHash = hashLocatorToken(token)

  const newToken = canonicalizeLocatorToken(randomUUID())
  if (!newToken) {
    throw createError({ statusCode: 500, statusMessage: 'Could not generate locator token' })
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          identityId: qrIdentities.id,
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
        .set({ status: 'retired', retiredAt: new Date() })
        .where(eq(qrPayloads.id, row.payloadId))

      const [created] = await tx
        .insert(qrPayloads)
        .values({
          identityId: row.identityId,
          tokenHash: hashLocatorToken(newToken),
          tokenCiphertext: encryptLocatorToken(newToken),
          status: 'active',
          version: row.version + 1,
        })
        .returning()

      if (!created) {
        throw createError({ statusCode: 500, statusMessage: 'Could not issue replacement QR' })
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'qr.payload_rotated',
        entityType: 'motorcycle',
        entityId: row.motorcycleId,
        location: row.location,
        reason: parsed.data.reason || 'QR label rotated',
        metadata: {
          oldPayloadId: row.payloadId,
          newPayloadId: created.id,
          oldVersion: row.version,
          newVersion: row.version + 1,
        },
      })

      return { motorcycleId: row.motorcycleId, newToken }
    })

    return { qrToken: result.newToken }
  } catch (error) {
    throwApiError(error)
  }
})
