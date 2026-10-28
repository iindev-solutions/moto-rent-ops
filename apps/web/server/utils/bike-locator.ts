import { and, eq } from 'drizzle-orm'
import { getDb, motorcycles, qrIdentities, qrPayloads } from '@book-moto/db'
import { canonicalizeLocatorToken, canonicalizeManualCode } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'

export async function resolveBikeLocator(rawLocator: string) {
  const token = canonicalizeLocatorToken(rawLocator)
  const manualCode = token ? null : canonicalizeManualCode(rawLocator)
  if (!token && !manualCode) {
    return null
  }

  const db = await getDb()
  const [row] = await db
    .select({
      identityId: qrIdentities.id,
      payloadId: qrPayloads.id,
      payloadVersion: qrPayloads.version,
      tokenCiphertext: qrPayloads.tokenCiphertext,
      manualCode: qrPayloads.manualCode,
      motorcycleId: motorcycles.id,
      assetCode: motorcycles.assetCode,
      model: motorcycles.model,
      plate: motorcycles.plate,
      photoUrl: motorcycles.photoUrl,
      status: motorcycles.status,
      location: motorcycles.location,
      nextAction: motorcycles.nextAction,
    })
    .from(qrPayloads)
    .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
    .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
    .where(and(
      eq(qrPayloads.status, 'active'),
      token ? eq(qrPayloads.tokenHash, hashLocatorToken(token)) : eq(qrPayloads.manualCode, manualCode ?? ''),
    ))
    .limit(1)

  return row ?? null
}
