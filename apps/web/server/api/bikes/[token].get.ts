import { and, eq } from 'drizzle-orm'
import { getDb, qrIdentities, qrPayloads, motorcycles } from '@book-moto/db'
import { hashLocatorToken } from '@book-moto/db/crypto'
import { normalizeLocatorToken } from '@book-moto/domain/qr'
import { canAccessLocation, requireAppUser } from '../../../server/utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)

  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? normalizeLocatorToken(rawToken) : null

  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  try {
    const db = await getDb()
    const [row] = await db
      .select({
        id: motorcycles.id,
        assetCode: motorcycles.assetCode,
        model: motorcycles.model,
        plate: motorcycles.plate,
        status: motorcycles.status,
        location: motorcycles.location,
        nextAction: motorcycles.nextAction,
      })
      .from(qrPayloads)
      .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
      .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
      .where(and(
        eq(qrPayloads.tokenHash, hashLocatorToken(token)),
        eq(qrPayloads.status, 'active'),
      ))
      .limit(1)

    if (!row || !canAccessLocation(user, row.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    return row
  } catch (error) {
    if (isError(error)) {
      throw error
    }

    throw createError({ statusCode: 503, statusMessage: 'Database is not configured' })
  }
})
