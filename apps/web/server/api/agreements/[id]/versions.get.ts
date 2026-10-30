import { desc, eq } from 'drizzle-orm'
import { getDb, motorcycles, rentalAgreements, rentalAgreementVersions, rentalItems } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Agreement id is required' })

  const db = await getDb()
  try {
    const [agreement] = await db.select({ id: rentalAgreements.id }).from(rentalAgreements).where(eq(rentalAgreements.id, id)).limit(1)
    if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })

    const items = await db
      .select({ location: motorcycles.location })
      .from(rentalItems)
      .innerJoin(motorcycles, eq(rentalItems.motorcycleId, motorcycles.id))
      .where(eq(rentalItems.agreementId, id))
    for (const item of items) {
      if (!canAccessLocation(user, item.location)) {
        throw createError({ statusCode: 403, statusMessage: 'Agreement is outside your location scope' })
      }
    }

    const rows = await db
      .select()
      .from(rentalAgreementVersions)
      .where(eq(rentalAgreementVersions.agreementId, id))
      .orderBy(desc(rentalAgreementVersions.version))

    return {
      versions: rows.map(row => ({
        id: row.id,
        version: row.version,
        status: row.status,
        changeReason: row.changeReason,
        startDate: row.startDate ? row.startDate.toISOString() : null,
        endDate: row.endDate ? row.endDate.toISOString() : null,
        itemCount: Array.isArray(row.snapshot.items) ? row.snapshot.items.length : 0,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
