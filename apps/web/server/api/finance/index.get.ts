import { getDb, obligations, receipts, allocations, deposits, depositDispositions } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const db = await getDb()
  try {
    const obligationRows = await db.select().from(obligations)
    const receiptRows = await db.select().from(receipts)
    const allocationRows = await db.select().from(allocations)
    const depositRows = await db.select().from(deposits)
    const dispositionRows = await db.select().from(depositDispositions)

    const appliedByDeposit = new Map<string, number>()
    for (const disposition of dispositionRows) {
      if (disposition.type === 'applied') {
        appliedByDeposit.set(disposition.depositId, (appliedByDeposit.get(disposition.depositId) || 0) + disposition.amountMinor)
      }
    }

    const allocatedByObligation = new Map<string, number>()
    for (const allocation of allocationRows) {
      allocatedByObligation.set(allocation.obligationId, (allocatedByObligation.get(allocation.obligationId) || 0) + allocation.amountMinor)
    }

    return {
      obligations: obligationRows.map(row => ({
        id: row.id,
        type: row.type,
        status: (() => { const allocated = (allocatedByObligation.get(row.id) || 0); const balance = row.amountMinor - allocated; if (balance <= 0) return 'settled'; if (allocated > 0) return 'partially_allocated'; if (row.dueDate && row.dueDate < new Date()) return 'overdue'; return 'planned'; })(),
        amountMinor: row.amountMinor,
        allocatedMinor: allocatedByObligation.get(row.id) || 0,
        balanceMinor: row.amountMinor - (allocatedByObligation.get(row.id) || 0),
        currency: row.currency,
        dueDate: row.dueDate ? row.dueDate.toISOString() : null,
        clientId: row.clientId,
      })),
      receipts: receiptRows.map(row => ({
        id: row.id,
        amountMinor: row.amountMinor,
        currency: row.currency,
        method: row.method,
        receivedAt: row.receivedAt.toISOString(),
        clientId: row.clientId,
      })),
      deposits: depositRows.map(row => ({
        id: row.id,
        type: row.type,
        status: row.status,
        amountMinor: row.amountMinor,
        remainingMinor: row.amountMinor === null ? null : row.amountMinor - (appliedByDeposit.get(row.id) || 0),
        currency: row.currency,
        clientId: row.clientId,
        receivedAt: row.receivedAt.toISOString(),
        returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
