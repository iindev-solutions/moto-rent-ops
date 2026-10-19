import { eq } from 'drizzle-orm'
import { getDb, deposits, auditEvents, depositDispositions, documentCustodies } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Deposit id is required' })

  const db = await getDb()
  try {
    const returnedAt = new Date()
    await db.transaction(async (tx) => {
      const [deposit] = await tx.select().from(deposits).where(eq(deposits.id, id)).limit(1).for('update')
      if (!deposit) throw createError({ statusCode: 404, statusMessage: 'Deposit not found' })
      if (deposit.status !== 'held') throw createError({ statusCode: 409, statusMessage: 'Deposit is not held' })

      const prior = await tx.select().from(depositDispositions).where(eq(depositDispositions.depositId, id))
      const applied = prior.filter(d => d.type === 'applied').reduce((sum, d) => sum + d.amountMinor, 0)
      const remaining = (deposit.amountMinor || 0) - applied
      if (remaining > 0) {
        await tx.insert(depositDispositions).values({ depositId: id, type: 'returned', amountMinor: remaining })
      }

      if (deposit.type === 'document_custody' && deposit.documentCustodyId) {
        const [custody] = await tx.select().from(documentCustodies).where(eq(documentCustodies.id, deposit.documentCustodyId)).limit(1)
        if (custody && custody.status === 'held') {
          await tx.update(documentCustodies).set({
            status: 'returned',
            returnedAt,
            returnedByUserId: user.id,
            updatedAt: returnedAt,
          }).where(eq(documentCustodies.id, custody.id))
        }
      }

      await tx.update(deposits).set({ status: 'returned', returnedAt, updatedAt: returnedAt }).where(eq(deposits.id, id))

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'finance.deposit_returned',
        entityType: 'deposit',
        entityId: id,
        metadata: { type: deposit.type, amountMinor: deposit.amountMinor, returnedMinor: Math.max(0, remaining) },
      })
    })

    return { returned: true }
  } catch (error) {
    throwApiError(error)
  }
})
