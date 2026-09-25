import { and, eq } from 'drizzle-orm'
import { getDb, motorcycles, qrIdentities, qrPayloads } from '@book-moto/db'
import { decryptLocatorToken } from '@book-moto/db/crypto'
import { canAccessLocation, requireAppUser } from '../../server/utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const db = await getDb()
  const rows = await db.select({
    id: motorcycles.id,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    plate: motorcycles.plate,
    status: motorcycles.status,
    location: motorcycles.location,
    nextAction: motorcycles.nextAction,
    tokenCiphertext: qrPayloads.tokenCiphertext,
  }).from(motorcycles)
    .leftJoin(qrIdentities, eq(qrIdentities.motorcycleId, motorcycles.id))
    .leftJoin(qrPayloads, and(eq(qrPayloads.identityId, qrIdentities.id), eq(qrPayloads.status, 'active')))

  const visible = rows.filter(row => canAccessLocation(user, row.location))
  const recentBikes = visible.slice(0, 5).map(({ tokenCiphertext, ...bike }) => ({
    ...bike,
    qrToken: tokenCiphertext ? decryptLocatorToken(tokenCiphertext) : null,
  }))

  return {
    stats: {
      total: visible.length,
      available: visible.filter(row => row.status === 'available').length,
      rented: visible.filter(row => row.status === 'rented').length,
      attention: visible.filter(row => ['maintenance', 'blocked', 'inspection'].includes(row.status)).length,
    },
    recentBikes,
  }
})
