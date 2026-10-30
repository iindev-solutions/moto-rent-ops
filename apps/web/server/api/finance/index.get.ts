import { asc, desc, eq } from 'drizzle-orm'
import { getDb, obligations, receipts, allocations, deposits, depositDispositions, clients } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const db = await getDb()
  try {
    const [obligationRows, receiptRows, allocationRows, depositRows, dispositionRows, clientRows] = await Promise.all([
      db.select().from(obligations).orderBy(asc(obligations.dueDate)),
      db.select().from(receipts).orderBy(desc(receipts.receivedAt)),
      db.select().from(allocations),
      db.select().from(deposits).orderBy(desc(deposits.receivedAt)),
      db.select().from(depositDispositions),
      db.select({ id: clients.id, displayName: clients.displayName }).from(clients),
    ])

    const clientNames = new Map(clientRows.map(row => [row.id, row.displayName]))

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

    const now = new Date()
    return {
      obligations: obligationRows.map(row => {
        const allocated = allocatedByObligation.get(row.id) || 0
        const balance = row.amountMinor - allocated
        const status = balance <= 0
          ? 'settled'
          : row.dueDate && row.dueDate < now
            ? 'overdue'
            : allocated > 0
              ? 'partially_allocated'
              : 'planned'
        return {
          id: row.id,
          type: row.type,
          status,
          amountMinor: row.amountMinor,
          allocatedMinor: allocated,
          balanceMinor: balance,
          currency: row.currency,
          dueDate: row.dueDate ? row.dueDate.toISOString() : null,
          clientId: row.clientId,
          clientName: row.clientId ? clientNames.get(row.clientId) ?? null : null,
        }
      }),
      receipts: receiptRows.map(row => ({
        id: row.id,
        amountMinor: row.amountMinor,
        currency: row.currency,
        method: row.method,
        receivedAt: row.receivedAt.toISOString(),
        clientId: row.clientId,
        clientName: row.clientId ? clientNames.get(row.clientId) ?? null : null,
      })),
      deposits: depositRows.map(row => ({
        id: row.id,
        type: row.type,
        status: row.status,
        amountMinor: row.amountMinor,
        remainingMinor: row.amountMinor === null ? null : row.amountMinor - (appliedByDeposit.get(row.id) || 0),
        currency: row.currency,
        clientId: row.clientId,
        clientName: clientNames.get(row.clientId) ?? null,
        receivedAt: row.receivedAt.toISOString(),
        returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
