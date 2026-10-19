import { asc, eq } from 'drizzle-orm'
import type { ActiveRentalSummary } from '@book-moto/contracts'
import { getDb, rentalItems, rentalAgreements, motorcycles, clients } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const db = await getDb()

  try {
    const rows = await db
      .select({
        itemId: rentalItems.id,
        agreementId: rentalItems.agreementId,
        clientId: clients.id,
        clientName: clients.displayName,
        assetCode: motorcycles.assetCode,
        model: motorcycles.model,
        plate: motorcycles.plate,
        location: motorcycles.location,
        startDate: rentalItems.startDate,
        endDate: rentalItems.endDate,
        dailyRateMinor: rentalItems.dailyRateMinor,
        currency: rentalItems.currency,
      })
      .from(rentalItems)
      .innerJoin(motorcycles, eq(motorcycles.id, rentalItems.motorcycleId))
      .innerJoin(rentalAgreements, eq(rentalAgreements.id, rentalItems.agreementId))
      .innerJoin(clients, eq(clients.id, rentalAgreements.clientId))
      .where(eq(rentalItems.status, 'active'))
      .orderBy(asc(rentalItems.endDate))

    const rentals: ActiveRentalSummary[] = rows
      .filter(row => canAccessLocation(user, row.location))
      .map(row => ({
        itemId: row.itemId,
        agreementId: row.agreementId,
        clientId: row.clientId,
        clientName: row.clientName,
        assetCode: row.assetCode,
        model: row.model,
        plate: row.plate,
        location: row.location,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        dailyRateMinor: row.dailyRateMinor,
        currency: row.currency,
      }))

    return { rentals }
  } catch (error) {
    throwApiError(error)
  }
})
