import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, documentCustodies, auditEvents } from '@book-moto/db'
import { documentExpiryStatus } from '../../../../server/utils/documents'

const bodySchema = z.object({
  maskedNumber: z.string().trim().max(64).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).refine(data => data.maskedNumber !== undefined || data.expiresAt !== undefined, { message: 'Nothing to update' })

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Document id is required' })
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid document payload' })

  let expiresAt: Date | null | undefined
  if (parsed.data.expiresAt !== undefined) {
    if (parsed.data.expiresAt === null) {
      expiresAt = null
    } else {
      expiresAt = new Date(parsed.data.expiresAt)
      if (Number.isNaN(expiresAt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid expiry date' })
    }
  }

  const db = await getDb()
  try {
    const updated = await db.transaction(async (tx) => {
      const [document] = await tx.select().from(documentCustodies).where(eq(documentCustodies.id, id)).limit(1).for('update')
      if (!document) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
      if (document.status !== 'held') throw createError({ statusCode: 409, statusMessage: 'Only held documents can be updated' })

      const changes: { maskedNumber?: string | null, expiresAt?: Date | null, updatedAt: Date } = { updatedAt: new Date() }
      if (parsed.data.maskedNumber !== undefined) changes.maskedNumber = parsed.data.maskedNumber
      if (expiresAt !== undefined) changes.expiresAt = expiresAt

      const [row] = await tx.update(documentCustodies).set(changes).where(eq(documentCustodies.id, id)).returning()
      if (!row) throw createError({ statusCode: 500, statusMessage: 'Could not update document' })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'document.updated',
        entityType: 'document_custody',
        entityId: id,
        metadata: {
          maskedNumber: row.maskedNumber,
          expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        },
      })

      return row
    })

    return {
      document: {
        ...updated,
        receivedAt: updated.receivedAt.toISOString(),
        returnedAt: updated.returnedAt ? updated.returnedAt.toISOString() : null,
        expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
        expiryStatus: documentExpiryStatus(updated.expiresAt),
      },
    }
  } catch (error) {
    throwApiError(error)
  }
})
