import { and, eq } from 'drizzle-orm'
import { getDb, motorcycles, qrIdentities, qrPayloads } from '@book-moto/db'
import { decryptLocatorToken } from '@book-moto/db/crypto'
import { canAccessLocation, requireAppUser } from '../../../server/utils/auth'

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

  return {
    bikes: rows
      .filter(row => canAccessLocation(user, row.location))
      .map(({ tokenCiphertext, ...bike }) => ({
        ...bike,
        qrToken: tokenCiphertext ? decryptLocatorToken(tokenCiphertext) : null,
      })),
  }
})
