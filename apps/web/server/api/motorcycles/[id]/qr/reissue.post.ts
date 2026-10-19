import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, motorcycles, qrIdentities, qrPayloads, auditEvents } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { encryptLocatorToken, hashLocatorToken } from '@book-moto/db/crypto'
import { randomUUID } from 'node:crypto'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500).default('QR label reissued'),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const motorcycleId = getRouterParam(event, 'id')
  if (!motorcycleId) throw createError({ statusCode: 400, statusMessage: 'Motorcycle id is required' })

  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid reissue payload' })

  const db = await getDb()
  try {
    const newToken = canonicalizeLocatorToken(randomUUID())
    if (!newToken) throw createError({ statusCode: 500, statusMessage: 'Could not generate locator token' })

    const result = await db.transaction(async (tx) => {
      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, motorcycleId)).limit(1)
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })

      let [identity] = await tx.select().from(qrIdentities).where(eq(qrIdentities.motorcycleId, motorcycleId)).limit(1)
      if (!identity) {
        ;[identity] = await tx.insert(qrIdentities).values({ motorcycleId }).returning()
      }
      if (!identity) throw createError({ statusCode: 500, statusMessage: 'Could not create QR identity' })

      const activePayloads = await tx.select().from(qrPayloads).where(and(eq(qrPayloads.identityId, identity.id), eq(qrPayloads.status, 'active')))
      for (const payload of activePayloads) {
        await tx.update(qrPayloads).set({ status: 'retired', retiredAt: new Date() }).where(eq(qrPayloads.id, payload.id))
      }

      const [created] = await tx.insert(qrPayloads).values({
        identityId: identity.id,
        tokenHash: hashLocatorToken(newToken),
        tokenCiphertext: encryptLocatorToken(newToken),
        status: 'active',
        version: (activePayloads[0]?.version ?? 0) + 1,
      }).returning()

      if (!created) throw createError({ statusCode: 500, statusMessage: 'Could not issue QR' })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'qr.payload_reissued',
        entityType: 'motorcycle',
        entityId: motorcycleId,
        location: bike.location,
        reason: parsed.data.reason,
        metadata: { newPayloadId: created.id, retiredCount: activePayloads.length },
      })

      return newToken
    })

    return { qrToken: result }
  } catch (error) {
    throwApiError(error)
  }
})
