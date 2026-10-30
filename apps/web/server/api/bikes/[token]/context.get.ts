import { desc, eq, inArray } from 'drizzle-orm'
import { getDb, rentalItems, rentalAgreements, clients, deposits, obligations, receipts, allocations } from '@book-moto/db'
import { resolveBikeLocator } from '../../../utils/bike-locator'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

  const db = await getDb()

  try {
    const bike = await resolveBikeLocator(rawToken)
    if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

    const items = await db
      .select({
        id: rentalItems.id,
        agreementId: rentalItems.agreementId,
        startDate: rentalItems.startDate,
        endDate: rentalItems.endDate,
        dailyRateMinor: rentalItems.dailyRateMinor,
        currency: rentalItems.currency,
        status: rentalItems.status,
      })
      .from(rentalItems)
      .where(eq(rentalItems.motorcycleId, bike.motorcycleId))
      .orderBy(desc(rentalItems.createdAt))
      .limit(10)

    const item = items.find(entry => entry.status === 'active') ?? items.find(entry => entry.status === 'planned') ?? null

    let activeRental = null
    let clientDeposits: any[] = []
    let clientObligations: any[] = []
    let clientReceipts: any[] = []
    const allocatedByObligation = new Map<string, number>()

    if (item) {
      const [agreement] = await db.select().from(rentalAgreements).where(eq(rentalAgreements.id, item.agreementId)).limit(1)
      const [client] = agreement ? await db.select().from(clients).where(eq(clients.id, agreement.clientId)).limit(1) : [null]
      activeRental = {
        itemId: item.id,
        agreementId: item.agreementId,
        status: item.status,
        startDate: item.startDate.toISOString(),
        endDate: item.endDate.toISOString(),
        dailyRateMinor: item.dailyRateMinor,
        currency: item.currency,
        agreementStatus: agreement?.status ?? null,
        client: client ? { id: client.id, displayName: client.displayName } : null,
      }

      if (agreement) {
        clientDeposits = await db.select().from(deposits).where(eq(deposits.agreementId, agreement.id))
        clientObligations = await db.select().from(obligations).where(eq(obligations.agreementId, agreement.id))
        const obligationIds = clientObligations.map(o => o.id)
        if (obligationIds.length > 0) {
          const allocationRows = await db.select({ obligationId: allocations.obligationId, amountMinor: allocations.amountMinor })
            .from(allocations)
            .where(inArray(allocations.obligationId, obligationIds))
          for (const row of allocationRows) {
            allocatedByObligation.set(row.obligationId, (allocatedByObligation.get(row.obligationId) ?? 0) + row.amountMinor)
          }
        }
      }
      if (client) {
        clientReceipts = await db.select().from(receipts).where(eq(receipts.clientId, client.id)).orderBy(desc(receipts.receivedAt)).limit(10)
      }
    }

    return {
      bike,
      activeRental,
      deposits: clientDeposits.map(d => ({ ...d, receivedAt: d.receivedAt.toISOString(), returnedAt: d.returnedAt ? d.returnedAt.toISOString() : null })),
      obligations: clientObligations.map((o) => {
        const allocated = allocatedByObligation.get(o.id) ?? 0
        const balance = o.amountMinor - allocated
        const status = balance <= 0
          ? 'settled'
          : o.dueDate && o.dueDate.getTime() < Date.now()
            ? 'overdue'
            : allocated > 0
              ? 'partially_allocated'
              : 'planned'
        return {
          ...o,
          status,
          balanceMinor: Math.max(0, balance),
          dueDate: o.dueDate ? o.dueDate.toISOString() : null,
          createdAt: o.createdAt.toISOString(),
        }
      }),
      receipts: clientReceipts.map(r => ({ ...r, receivedAt: r.receivedAt.toISOString(), createdAt: r.createdAt.toISOString() })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
