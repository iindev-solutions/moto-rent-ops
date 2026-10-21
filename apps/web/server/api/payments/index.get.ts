import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import type { PaymentsData } from '@book-moto/contracts'
import { getDb, allocations, clients, obligations, receipts } from '@book-moto/db'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default defineEventHandler(async (event): Promise<PaymentsData> => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)

  const now = new Date()
  const requestedMonth = getQuery(event).month
  const month = typeof requestedMonth === 'string' && MONTH_RE.test(requestedMonth)
    ? requestedMonth
    : monthKey(now)
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const rangeStart = new Date(year, monthNumber - 1, 1)
  const rangeEnd = new Date(year, monthNumber, 1)
  const db = await getDb()

  try {
    const receiptRows = await db.select({
      id: receipts.id,
      amountMinor: receipts.amountMinor,
      currency: receipts.currency,
      method: receipts.method,
      receivedAt: receipts.receivedAt,
      clientId: receipts.clientId,
      clientName: clients.displayName,
    }).from(receipts)
      .leftJoin(clients, eq(clients.id, receipts.clientId))
      .where(and(
        gte(receipts.receivedAt, rangeStart),
        lt(receipts.receivedAt, rangeEnd),
      ))
      .orderBy(desc(receipts.receivedAt))

    const dueRows = await db.select({
      id: obligations.id,
      type: obligations.type,
      amountMinor: obligations.amountMinor,
      currency: obligations.currency,
      dueDate: obligations.dueDate,
      clientId: obligations.clientId,
      clientName: clients.displayName,
    }).from(obligations)
      .leftJoin(clients, eq(clients.id, obligations.clientId))
      .where(and(
        isNotNull(obligations.dueDate),
        gte(obligations.dueDate, rangeStart),
        lt(obligations.dueDate, rangeEnd),
      ))
      .orderBy(asc(obligations.dueDate))

    const allocatedByObligation = new Map<string, number>()
    if (dueRows.length > 0) {
      const allocationRows = await db.select({
        obligationId: allocations.obligationId,
        amountMinor: allocations.amountMinor,
      }).from(allocations).where(inArray(allocations.obligationId, dueRows.map(row => row.id)))
      for (const allocation of allocationRows) {
        allocatedByObligation.set(allocation.obligationId, (allocatedByObligation.get(allocation.obligationId) ?? 0) + allocation.amountMinor)
      }
    }

    const due = dueRows.map(row => {
      const allocatedMinor = allocatedByObligation.get(row.id) ?? 0
      const balanceMinor = row.amountMinor - allocatedMinor
      const dueDate = row.dueDate!
      const status = balanceMinor <= 0
        ? 'settled'
        : dueDate.getTime() < now.getTime()
          ? 'overdue'
          : allocatedMinor > 0
            ? 'partially_allocated'
            : 'planned'
      return {
        id: row.id,
        type: row.type,
        status,
        amountMinor: row.amountMinor,
        allocatedMinor,
        balanceMinor,
        currency: row.currency,
        dueDate: dueDate.toISOString(),
        clientId: row.clientId,
        clientName: row.clientName,
      }
    }).filter(row => row.balanceMinor > 0)

    const overdue = due.filter(row => new Date(row.dueDate).getTime() < now.getTime())
    const receivedMinor = receiptRows.reduce((total, row) => total + row.amountMinor, 0)
    const dueMinor = due.reduce((total, row) => total + row.balanceMinor, 0)
    const overdueMinor = overdue.reduce((total, row) => total + row.balanceMinor, 0)

    return {
      month,
      receipts: receiptRows.map(row => ({
        id: row.id,
        amountMinor: row.amountMinor,
        currency: row.currency,
        method: row.method,
        receivedAt: row.receivedAt.toISOString(),
        clientId: row.clientId,
        clientName: row.clientName,
      })),
      due,
      totals: { receivedMinor, dueMinor, overdueMinor },
      counts: { receipts: receiptRows.length, due: due.length, overdue: overdue.length },
    }
  } catch (error) {
    throwApiError(error)
  }
})
