import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { encryptLocatorToken, hashLocatorToken } from './crypto'
import { motorcycles, qrIdentities, qrPayloads } from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const pool = new Pool({ connectionString })
const db = drizzle(pool)

const fixtures = [
  { assetCode: 'BM-001', model: 'Honda CB500F', plate: '59-B1 001', status: 'available', location: 'Hanoi Hub', nextAction: 'Print QR label' },
  { assetCode: 'BM-002', model: 'Yamaha MT-07', plate: '59-B1 002', status: 'rented', location: 'Hanoi Hub', nextAction: 'Return check' },
  { assetCode: 'BM-003', model: 'KTM 390 Adventure', plate: '59-B1 003', status: 'maintenance', location: 'Workshop', nextAction: 'Service due' },
]

for (const fixture of fixtures) {
  const [bike] = await db.insert(motorcycles).values(fixture).onConflictDoNothing().returning()
  if (!bike) {
    continue
  }

  const [identity] = await db.insert(qrIdentities).values({ motorcycleId: bike.id }).returning()
  if (!identity) {
    continue
  }

  const token = canonicalizeLocatorToken(randomUUID())
  if (!token) {
    throw new Error('Generated bike token is invalid')
  }

  await db.insert(qrPayloads).values({
    identityId: identity.id,
    tokenHash: hashLocatorToken(token),
    tokenCiphertext: encryptLocatorToken(token),
  })
}

await pool.end()
console.log(`Seeded ${fixtures.length} motorcycle fixtures`)
