import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, qrPayloads, auditEvents } from '@book-moto/db'
import { resolveBikeLocator } from '../../../utils/bike-locator'
import { createQrCredentials } from '../../../utils/qr-issue'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rotation payload' })
  }

  const db = await getDb()

  try {
    const locator = await resolveBikeLocator(rawToken)
    if (!locator || !canAccessLocation(user, locator.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    const credentials = createQrCredentials()

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
        .set({ status: 'retired', retiredAt: new Date() })
        .where(eq(qrPayloads.id, active.id))

      const [created] = await tx
        .insert(qrPayloads)
        .values({
          identityId: locator.identityId,
          tokenHash: credentials.tokenHash,
          tokenCiphertext: credentials.tokenCiphertext,
          manualCode: credentials.manualCode,
          status: 'active',
          version: active.version + 1,
        })
        .returning()

      if (!created) {
        throw createError({ statusCode: 500, statusMessage: 'Could not issue replacement QR' })
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'qr.payload_rotated',
        entityType: 'motorcycle',
        entityId: locator.motorcycleId,
        location: locator.location,
        reason: parsed.data.reason || 'QR label rotated',
        metadata: {
          oldPayloadId: active.id,
          newPayloadId: created.id,
          oldVersion: active.version,
          newVersion: active.version + 1,
        },
      })
    })

    return { qrToken: credentials.token, manualCode: credentials.manualCode }
  } catch (error) {
    throwApiError(error)
  }
})
