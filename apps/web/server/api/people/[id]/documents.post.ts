import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, documentCustodies, auditEvents, clients } from '@book-moto/db'

const bodySchema = z.object({
  documentType: z.string().trim().min(2).max(64),
  maskedNumber: z.string().trim().max(64).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid document payload' })

  const db = await getDb()
  try {
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid expiry date' })
    if (expiresAt && expiresAt.getTime() < Date.now()) throw createError({ statusCode: 400, statusMessage: 'Document is already expired' })

    const document = await db.transaction(async (tx) => {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
      if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

      const [row] = await tx.insert(documentCustodies).values({
        clientId,
        documentType: parsed.data.documentType,
        maskedNumber: parsed.data.maskedNumber || null,
        expiresAt,
        receivedByUserId: user.id,
        notes: parsed.data.notes || null,
      }).returning()

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'document.received',
        entityType: 'client',
        entityId: clientId,
        metadata: { documentType: parsed.data.documentType, maskedNumber: parsed.data.maskedNumber || null, expiresAt: expiresAt ? expiresAt.toISOString() : null },
      })

      return row
    })

    return { document }
  } catch (error) {
    throwApiError(error)
  }
})
