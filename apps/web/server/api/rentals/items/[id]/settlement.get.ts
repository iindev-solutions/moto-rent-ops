import { desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { RentalItemSettlement, SettlementObligation } from '@book-moto/contracts'
import { getDb, rentalItems, rentalAgreements, motorcycles, obligations, allocations, deposits, depositDispositions, documentCustodies } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const itemId = getRouterParam(event, 'id')
  if (!itemId) throw createError({ statusCode: 400, statusMessage: 'Rental item id is required' })

  const db = await getDb()
  try {
    const [item] = await db.select().from(rentalItems).where(eq(rentalItems.id, itemId)).limit(1)
    if (!item) throw createError({ statusCode: 404, statusMessage: 'Rental item not found' })

    const [bike] = await db.select({ location: motorcycles.location }).from(motorcycles).where(eq(motorcycles.id, item.motorcycleId)).limit(1)
    if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })

    const [agreement] = await db.select().from(rentalAgreements).where(eq(rentalAgreements.id, item.agreementId)).limit(1)
    if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })

    const obligationRows = await db
      .select({
        id: obligations.id,
        type: obligations.type,
        amountMinor: obligations.amountMinor,
      })
      .from(obligations)
      .where(eq(obligations.rentalItemId, itemId))

    const obligationIds = obligationRows.map(row => row.id)
    const allocatedByObligation = new Map<string, number>()
    if (obligationIds.length > 0) {
      const allocationRows = await db
        .select({ obligationId: allocations.obligationId, amountMinor: allocations.amountMinor })
        .from(allocations)
        .where(inArray(allocations.obligationId, obligationIds))
      for (const allocation of allocationRows) {
        allocatedByObligation.set(allocation.obligationId, (allocatedByObligation.get(allocation.obligationId) ?? 0) + allocation.amountMinor)
      }
    }

    const settledObligations: SettlementObligation[] = obligationRows.map(row => ({
      id: row.id,
      type: row.type,
      amountMinor: row.amountMinor,
      dueMinor: Math.max(0, row.amountMinor - (allocatedByObligation.get(row.id) ?? 0)),
    }))
    const totalDueMinor = settledObligations.reduce((sum, row) => sum + row.dueMinor, 0)

    const depositRows = await db
      .select()
      .from(deposits)
      .where(or(eq(deposits.agreementId, agreement.id), isNull(deposits.agreementId)))
      .orderBy(desc(deposits.receivedAt))
    const candidateDeposits = depositRows.filter(row => row.clientId === agreement.clientId)
    const deposit = candidateDeposits.find(row => row.agreementId === agreement.id && row.status !== 'returned')
      ?? candidateDeposits.find(row => row.agreementId === agreement.id)
      ?? candidateDeposits.find(row => row.status === 'held')
      ?? candidateDeposits[0]
      ?? null

    let depositSummary: RentalItemSettlement['deposit'] = null
    let document: RentalItemSettlement['document'] = null
    if (deposit) {
      const dispositions = await db
        .select({ type: depositDispositions.type, amountMinor: depositDispositions.amountMinor })
        .from(depositDispositions)
        .where(eq(depositDispositions.depositId, deposit.id))
      const applied = dispositions.filter(row => row.type === 'applied').reduce((sum, row) => sum + row.amountMinor, 0)
      const remaining = deposit.status === 'returned' ? 0 : Math.max(0, (deposit.amountMinor ?? 0) - applied)
      depositSummary = {
        id: deposit.id,
        type: deposit.type,
        amountMinor: deposit.amountMinor,
        status: deposit.status,
        remainingMinor: remaining,
      }

      if (deposit.documentCustodyId) {
        const [custody] = await db.select().from(documentCustodies).where(eq(documentCustodies.id, deposit.documentCustodyId)).limit(1)
        if (custody) {
          document = {
            id: custody.id,
            documentType: custody.documentType,
            status: custody.status,
          }
        }
      }
    } else {
      const [custody] = await db
        .select()
        .from(documentCustodies)
        .where(eq(documentCustodies.clientId, agreement.clientId))
        .orderBy(desc(documentCustodies.receivedAt))
        .limit(1)
      if (custody) {
        document = {
          id: custody.id,
          documentType: custody.documentType,
          status: custody.status,
        }
      }
    }

    const settlement: RentalItemSettlement = {
      itemId,
      agreementId: agreement.id,
      clientId: agreement.clientId,
      itemStatus: item.status,
      agreementStatus: agreement.status,
      currency: item.currency,
      obligations: settledObligations,
      totalDueMinor,
      deposit: depositSummary,
      document,
    }

    return { settlement }
  } catch (error) {
    throwApiError(error)
  }
})
