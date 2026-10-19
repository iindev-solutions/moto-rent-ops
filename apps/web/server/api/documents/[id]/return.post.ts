import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getDb, documentCustodies, auditEvents, deposits, depositDispositions } from '@book-moto/db'

const bodySchema = z.object({
  notes: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Document id is required' })
  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid return payload' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [document] = await tx.select().from(documentCustodies).where(eq(documentCustodies.id, id)).limit(1).for('update')
      if (!document) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
      if (document.status !== 'held') throw createError({ statusCode: 409, statusMessage: 'Document is not held' })

      const returnedAt = new Date()
      await tx.update(documentCustodies).set({
        status: 'returned',
        returnedAt,
        returnedByUserId: user.id,
        notes: parsed.data.notes || document.notes,
        updatedAt: returnedAt,
      }).where(eq(documentCustodies.id, id))

      const linkedDeposits = await tx
        .select()
        .from(deposits)
        .where(and(eq(deposits.documentCustodyId, id), eq(deposits.status, 'held')))
        .for('update')

      for (const deposit of linkedDeposits) {
        const prior = await tx.select().from(depositDispositions).where(eq(depositDispositions.depositId, deposit.id))
        const applied = prior.filter(d => d.type === 'applied').reduce((sum, d) => sum + d.amountMinor, 0)
        const remaining = (deposit.amountMinor || 0) - applied
        if (remaining > 0) {
          await tx.insert(depositDispositions).values({ depositId: deposit.id, type: 'returned', amountMinor: remaining })
        }
        await tx.update(deposits).set({ status: 'returned', returnedAt, updatedAt: returnedAt }).where(eq(deposits.id, deposit.id))
        await tx.insert(auditEvents).values({
          actorUserId: user.id,
          action: 'finance.deposit_returned',
          entityType: 'deposit',
          entityId: deposit.id,
          metadata: { reason: 'document_returned', returnedMinor: Math.max(0, remaining) },
        })
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'document.returned',
        entityType: 'client',
        entityId: document.clientId,
        metadata: { documentId: id, documentType: document.documentType, releasedDeposits: linkedDeposits.length },
      })
    })

    return { returned: true }
  } catch (error) {
    throwApiError(error)
  }
})
