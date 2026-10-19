import { count, desc, inArray } from 'drizzle-orm'
import { getDb, clients, rentalAgreements, rentalItems } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const db = await getDb()
  try {
    const agreements = await db.select().from(rentalAgreements).orderBy(desc(rentalAgreements.updatedAt))
    const clientIds = [...new Set(agreements.map(agreement => agreement.clientId))]
    const clientRows = clientIds.length > 0
      ? await db.select({ id: clients.id, displayName: clients.displayName }).from(clients).where(inArray(clients.id, clientIds))
      : []
    const clientNames = new Map(clientRows.map(client => [client.id, client.displayName]))

    const agreementIds = agreements.map(agreement => agreement.id)
    const itemCounts = new Map<string, number>()
    if (agreementIds.length > 0) {
      const itemCountRows = await db
        .select({ agreementId: rentalItems.agreementId, itemCount: count() })
        .from(rentalItems)
        .where(inArray(rentalItems.agreementId, agreementIds))
        .groupBy(rentalItems.agreementId)
      for (const row of itemCountRows) {
        itemCounts.set(row.agreementId, Number(row.itemCount))
      }
    }

    return {
      agreements: agreements.map(agreement => ({
        id: agreement.id,
        status: agreement.status,
        clientId: agreement.clientId,
        clientName: clientNames.get(agreement.clientId) ?? null,
        startDate: agreement.startDate ? agreement.startDate.toISOString() : null,
        endDate: agreement.endDate ? agreement.endDate.toISOString() : null,
        itemCount: itemCounts.get(agreement.id) ?? 0,
        createdAt: agreement.createdAt.toISOString(),
        updatedAt: agreement.updatedAt.toISOString(),
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
