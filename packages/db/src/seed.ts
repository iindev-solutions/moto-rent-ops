import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { and, eq } from 'drizzle-orm'
import { hash } from 'argon2'
import { randomUUID } from 'node:crypto'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { closeDb, getDb } from './client'
import { encryptLocatorToken, hashLocatorToken } from './crypto'
import { motorcycles, qrIdentities, qrPayloads, users } from './schema'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const db = await getDb()

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
const adminPassword = process.env.SEED_ADMIN_PASSWORD
if (!adminEmail || !adminPassword) {
  throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required')
}
const adminPasswordHash = await hash(adminPassword)

await db.insert(users).values({
  email: adminEmail,
  name: 'System Owner',
  passwordHash: adminPasswordHash,
  role: 'owner',
  locationScope: ['*'],
}).onConflictDoUpdate({
  target: users.email,
  set: {
    passwordHash: adminPasswordHash,
    active: true,
    role: 'owner',
    locationScope: ['*'],
  },
})

const fixtures = [
  { assetCode: 'BM-001', model: 'Honda CB500F', plate: '59-B1 001', status: 'available', location: 'Hanoi Hub', nextAction: 'Print QR label' },
  { assetCode: 'BM-002', model: 'Yamaha MT-07', plate: '59-B1 002', status: 'rented', location: 'Hanoi Hub', nextAction: 'Return check' },
  { assetCode: 'BM-003', model: 'KTM 390 Adventure', plate: '59-B1 003', status: 'maintenance', location: 'Workshop', nextAction: 'Service due' },
]

for (const fixture of fixtures) {
  let [bike] = await db.select().from(motorcycles).where(eq(motorcycles.assetCode, fixture.assetCode)).limit(1)
  if (!bike) {
    ;[bike] = await db.insert(motorcycles).values(fixture).returning()
  }
  if (!bike) {
    throw new Error(`Could not create motorcycle ${fixture.assetCode}`)
  }

  let [identity] = await db.select().from(qrIdentities).where(eq(qrIdentities.motorcycleId, bike.id)).limit(1)
  if (!identity) {
    ;[identity] = await db.insert(qrIdentities).values({ motorcycleId: bike.id }).returning()
  }
  if (!identity) {
    throw new Error(`Could not create QR identity for ${fixture.assetCode}`)
  }

  const [activePayload] = await db.select({ id: qrPayloads.id }).from(qrPayloads).where(and(
    eq(qrPayloads.identityId, identity.id),
    eq(qrPayloads.status, 'active'),
  )).limit(1)
  if (activePayload) {
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

await closeDb()
console.log(`Seeded ${fixtures.length} motorcycle fixtures`)
