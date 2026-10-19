import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, deposits, obligations, receipts, allocations, auditEvents, depositDispositions } from '@book-moto/db'

const bodySchema = z.object({
  obligationId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Deposit id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid apply payload' })

  const db = await getDb()
  try {
    const result = await db.transaction(async (tx) => {
      const [deposit] = await tx.select().from(deposits).where(eq(deposits.id, id)).limit(1).for('update')
      if (!deposit) throw createError({ statusCode: 404, statusMessage: 'Deposit not found' })
      if (deposit.status !== 'held' || deposit.amountMinor === null) throw createError({ statusCode: 409, statusMessage: 'Deposit cannot be applied' })

      const [obligation] = await tx.select().from(obligations).where(eq(obligations.id, parsed.data.obligationId)).limit(1)
      if (!obligation) throw createError({ statusCode: 404, statusMessage: 'Obligation not found' })
      if (obligation.clientId && obligation.clientId !== deposit.clientId) {
        throw createError({ statusCode: 409, statusMessage: 'Deposit and obligation belong to different clients' })
      }
      if (obligation.currency !== deposit.currency) {
        throw createError({ statusCode: 409, statusMessage: 'Deposit and obligation currencies do not match' })
      }

      const priorDispositions = await tx.select().from(depositDispositions).where(eq(depositDispositions.depositId, id))
      const alreadyApplied = priorDispositions.filter(d => d.type === 'applied').reduce((sum, d) => sum + d.amountMinor, 0)
      const depositRemaining = deposit.amountMinor - alreadyApplied

      const obligationAllocations = await tx.select().from(allocations).where(eq(allocations.obligationId, obligation.id))
      const obligationAllocated = obligationAllocations.reduce((sum, a) => sum + a.amountMinor, 0)
      const obligationBalance = obligation.amountMinor - obligationAllocated

      const allocationAmount = Math.min(depositRemaining, obligationBalance)
      if (allocationAmount <= 0) throw createError({ statusCode: 409, statusMessage: 'Nothing to apply' })

      const [receipt] = await tx.insert(receipts).values({
        clientId: deposit.clientId,
        amountMinor: allocationAmount,
        currency: deposit.currency,
        method: 'deposit',
        receivedAt: new Date(),
        notes: `Applied deposit ${id}`,
      }).returning()
      if (!receipt) throw createError({ statusCode: 500, statusMessage: 'Could not record deposit receipt' })

      await tx.insert(allocations).values({
        receiptId: receipt.id,
        obligationId: obligation.id,
        amountMinor: allocationAmount,
      })

      await tx.insert(depositDispositions).values({
        depositId: id,
        obligationId: obligation.id,
        type: 'applied',
        amountMinor: allocationAmount,
      })

      if (allocationAmount === depositRemaining) {
        await tx.update(deposits).set({
          status: 'applied',
          appliedObligationId: obligation.id,
          updatedAt: new Date(),
        }).where(eq(deposits.id, id))
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'finance.deposit_applied',
        entityType: 'deposit',
        entityId: id,
        metadata: { obligationId: obligation.id, amountMinor: allocationAmount, receiptId: receipt.id, remainingDepositMinor: depositRemaining - allocationAmount },
      })

      return { amountMinor: allocationAmount, remainingDepositMinor: depositRemaining - allocationAmount }
    })

    return { applied: true, amountMinor: result.amountMinor, remainingDepositMinor: result.remainingDepositMinor }
  } catch (error) {
    throwApiError(error)
  }
})
