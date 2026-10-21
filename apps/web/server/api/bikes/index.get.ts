import { and, asc, eq, ilike, or } from 'drizzle-orm'
import { getDb, motorcycles, qrIdentities, qrPayloads } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const db = await getDb()
  const { limit, offset } = readPagination(event)
  const rawSearch = getQuery(event).search
  const search = typeof rawSearch === 'string' ? rawSearch.trim() : ''
  const filter = search
    ? or(
        ilike(motorcycles.assetCode, `%${search}%`),
        ilike(motorcycles.model, `%${search}%`),
        ilike(motorcycles.plate, `%${search}%`),
        ilike(motorcycles.location, `%${search}%`),
      )
    : undefined

  const rows = await db.select({
    id: motorcycles.id,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    plate: motorcycles.plate,
    status: motorcycles.status,
    location: motorcycles.location,
    nextAction: motorcycles.nextAction,
    tokenCiphertext: qrPayloads.tokenCiphertext,
    manualCode: qrPayloads.manualCode,
  }).from(motorcycles)
    .leftJoin(qrIdentities, eq(qrIdentities.motorcycleId, motorcycles.id))
    .leftJoin(qrPayloads, and(eq(qrPayloads.identityId, qrIdentities.id), eq(qrPayloads.status, 'active')))
    .where(filter)
    .orderBy(asc(motorcycles.assetCode), asc(motorcycles.id))

  const visible = rows
    .filter(row => canAccessLocation(user, row.location))
    .map(({ tokenCiphertext, ...bike }) => ({
      ...bike,
      qrToken: safeDecryptLocatorToken(tokenCiphertext),
    }))
  const page = paginate(visible, { limit, offset })

  return {
    bikes: page.items,
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.hasMore,
  }
})
