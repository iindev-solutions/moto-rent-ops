import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { and, eq } from 'drizzle-orm'
import { hash } from 'argon2'
import { randomUUID } from 'node:crypto'
import { buildBikeDeepLink, canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { closeDb, getDb } from './client'
import { decryptLocatorToken, encryptLocatorToken, hashLocatorToken } from './crypto'
import { clients, clientContacts, deposits, documentCustodies, handovers, incidents, maintenanceOrders, motorcycles, obligations, qrIdentities, qrPayloads, receipts, rentalAgreements, rentalItems, returnInspections, users, allocations } from './schema'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })
if (process.env.NODE_ENV === 'production') {
  throw new Error('db:seed is disabled in production')
}

const qrDeepLinks: string[] = []
const appUrl = process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000'

const db = await getDb()

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
const adminPassword = process.env.SEED_ADMIN_PASSWORD
if (!adminEmail || !adminPassword) {
  throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required')
}
const adminPasswordHash = await hash(adminPassword)

const [adminUser] = await db.insert(users).values({
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
}).returning()
if (!adminUser) {
  throw new Error('Could not create admin user')
}

const fixtures = [
  { assetCode: 'BM-001', model: 'Honda CB500F', plate: '59-B1 001', status: 'available', location: 'Hanoi Hub', nextAction: 'Print QR label' },
  { assetCode: 'BM-002', model: 'Yamaha MT-07', plate: '59-B1 002', status: 'rented', location: 'Hanoi Hub', nextAction: 'Return check' },
  { assetCode: 'BM-003', model: 'KTM 390 Adventure', plate: '59-B1 003', status: 'maintenance', location: 'Workshop', nextAction: 'Service due' },
  { assetCode: 'BM-004', model: 'Honda XR150L', plate: '29-A1 004', status: 'rented', location: 'Hanoi Hub', nextAction: null },
  { assetCode: 'BM-005', model: 'Yamaha XTZ150', plate: '29-A1 005', status: 'rented', location: 'Hanoi Hub', nextAction: null },
  { assetCode: 'BM-006', model: 'Honda Vision', plate: '29-A2 006', status: 'available', location: 'Hanoi Hub', nextAction: null },
  { assetCode: 'BM-007', model: 'Ducati Scrambler Icon', plate: '29-A3 007', status: 'reserved', location: 'Hanoi Hub', nextAction: 'Prepare for weekend pickup' },
  { assetCode: 'BM-008', model: 'Honda CB300R', plate: '29-A1 008', status: 'available', location: 'Hanoi Hub', nextAction: null },
  { assetCode: 'BM-009', model: 'Suzuki Raider R150', plate: '29-A1 009', status: 'inspection', location: 'Workshop', nextAction: 'Diagnose chain slip' },
  { assetCode: 'BM-010', model: 'Honda Winner X', plate: '29-A2 010', status: 'maintenance', location: 'Workshop', nextAction: 'Inspection before re-rent' },
]

const bikeIdByCode = new Map<string, string>()

for (const fixture of fixtures) {
  let [bike] = await db.select().from(motorcycles).where(eq(motorcycles.assetCode, fixture.assetCode)).limit(1)
  if (!bike) {
    ;[bike] = await db.insert(motorcycles).values(fixture).returning()
  }
  if (!bike) {
    throw new Error(`Could not create motorcycle ${fixture.assetCode}`)
  }
  bikeIdByCode.set(fixture.assetCode, bike.id)

  let [identity] = await db.select().from(qrIdentities).where(eq(qrIdentities.motorcycleId, bike.id)).limit(1)
  if (!identity) {
    ;[identity] = await db.insert(qrIdentities).values({ motorcycleId: bike.id }).returning()
  }
  if (!identity) {
    throw new Error(`Could not create QR identity for ${fixture.assetCode}`)
  }

  const [activePayload] = await db.select({ id: qrPayloads.id, tokenCiphertext: qrPayloads.tokenCiphertext }).from(qrPayloads).where(and(
    eq(qrPayloads.identityId, identity.id),
    eq(qrPayloads.status, 'active'),
  )).limit(1)
  if (activePayload) {
    const existingToken = decryptLocatorToken(activePayload.tokenCiphertext)
    if (existingToken) {
      qrDeepLinks.push(buildBikeDeepLink(appUrl, existingToken))
    }
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
  qrDeepLinks.push(buildBikeDeepLink(appUrl, token))
}

function expectRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message)
  }
  return row
}

const demoMarkerName = 'Nguyễn Văn Hùng'
const [existingDemoClient] = await db.select({ id: clients.id }).from(clients).where(eq(clients.displayName, demoMarkerName)).limit(1)

if (existingDemoClient) {
  console.log('Demo dataset already present, skipping')
} else {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const at = (days: number) => new Date(now + days * dayMs)

  const insertClient = async (displayName: string, preferredChannel: string, notes: string | null, contacts: Array<{ channel: string, value: string, isPrimary: boolean }>) => {
    const row = expectRow((await db.insert(clients).values({ displayName, preferredChannel, notes }).returning())[0], `Could not create client ${displayName}`)
    if (contacts.length > 0) {
      await db.insert(clientContacts).values(contacts.map(contact => ({ clientId: row.id, channel: contact.channel, value: contact.value, isPrimary: contact.isPrimary })))
    }
    return row
  }

  const bikeId = (assetCode: string) => {
    const id = bikeIdByCode.get(assetCode)
    if (!id) {
      throw new Error(`Missing motorcycle ${assetCode} for demo dataset`)
    }
    return id
  }

  const hung = await insertClient(demoMarkerName, 'whatsapp', 'Regular customer, rents the XR150L almost every month.', [
    { channel: 'phone', value: '+84 912 345 678', isPrimary: true },
    { channel: 'whatsapp', value: '+84 912 345 678', isPrimary: false },
  ])
  await insertClient('Trần Thị Mai', 'phone', null, [
    { channel: 'phone', value: '+84 903 221 447', isPrimary: true },
  ])
  const quan = await insertClient('Lê Minh Quân', 'telegram', 'Prefers scooters for city trips.', [
    { channel: 'phone', value: '+84 987 654 321', isPrimary: true },
    { channel: 'telegram', value: '@quanlm', isPrimary: false },
  ])
  await insertClient('Phạm Thu Hà', 'email', null, [
    { channel: 'email', value: 'ha.pham@example.com', isPrimary: true },
  ])
  const daniel = await insertClient('Daniel Fischer', 'whatsapp', 'German tourist, north loop tour. Passport on file.', [
    { channel: 'whatsapp', value: '+49 151 2345 6789', isPrimary: true },
    { channel: 'email', value: 'daniel.fischer@example.com', isPrimary: false },
  ])
  const yuki = await insertClient('Yuki Tanaka', 'email', 'Japanese tourist, weekend booking on the Scrambler.', [
    { channel: 'email', value: 'yuki.tanaka@example.jp', isPrimary: true },
  ])
  const chau = await insertClient('Ngô Bảo Châu', 'phone', null, [
    { channel: 'phone', value: '+84 936 118 220', isPrimary: true },
  ])

  const agreementHung = expectRow((await db.insert(rentalAgreements).values({
    clientId: hung.id, status: 'active', startDate: at(-3), endDate: at(4), notes: 'Weekly rental, two helmets included.',
  }).returning())[0], 'Could not create agreement for Hùng')

  const agreementDaniel = expectRow((await db.insert(rentalAgreements).values({
    clientId: daniel.id, status: 'active', startDate: at(-1), endDate: at(6), notes: 'North loop tour, roadside assistance included.',
  }).returning())[0], 'Could not create agreement for Daniel')

  const agreementQuan = expectRow((await db.insert(rentalAgreements).values({
    clientId: quan.id, status: 'closed', startDate: at(-20), endDate: at(-13), notes: null,
  }).returning())[0], 'Could not create agreement for Quân')

  const agreementYuki = expectRow((await db.insert(rentalAgreements).values({
    clientId: yuki.id, status: 'ready', startDate: at(2), endDate: at(9), notes: 'Weekend rental, pickup on Saturday morning.',
  }).returning())[0], 'Could not create agreement for Yuki')

  await db.insert(rentalAgreements).values({
    clientId: chau.id, status: 'draft', notes: 'Asked about a CB300R for next weekend.',
  })

  const itemHung = expectRow((await db.insert(rentalItems).values({
    agreementId: agreementHung.id, motorcycleId: bikeId('BM-004'), startDate: at(-3), endDate: at(4), dailyRateMinor: 350000, status: 'active',
  }).returning())[0], 'Could not create rental item for Hùng')

  const itemDaniel = expectRow((await db.insert(rentalItems).values({
    agreementId: agreementDaniel.id, motorcycleId: bikeId('BM-005'), startDate: at(-1), endDate: at(6), dailyRateMinor: 400000, status: 'active',
  }).returning())[0], 'Could not create rental item for Daniel')

  const itemQuan = expectRow((await db.insert(rentalItems).values({
    agreementId: agreementQuan.id, motorcycleId: bikeId('BM-006'), startDate: at(-20), endDate: at(-13), dailyRateMinor: 220000, status: 'returned',
  }).returning())[0], 'Could not create rental item for Quân')

  await db.insert(rentalItems).values({
    agreementId: agreementYuki.id, motorcycleId: bikeId('BM-007'), startDate: at(2), endDate: at(9), dailyRateMinor: 450000, status: 'planned',
  })

  await db.insert(handovers).values([
    { rentalItemId: itemHung.id, motorcycleId: bikeId('BM-004'), performedByUserId: adminUser.id, odometer: 12450, fuelLevel: 'full', checklist: { helmets: 2, phoneMount: true, damage: 'Minor scratch on left fairing' }, createdAt: at(-3) },
    { rentalItemId: itemDaniel.id, motorcycleId: bikeId('BM-005'), performedByUserId: adminUser.id, odometer: 8900, fuelLevel: '3/4', checklist: { helmets: 2, rainPoncho: true }, createdAt: at(-1) },
    { rentalItemId: itemQuan.id, motorcycleId: bikeId('BM-006'), performedByUserId: adminUser.id, odometer: 15100, fuelLevel: 'full', checklist: { helmets: 1 }, createdAt: at(-20) },
  ])

  await db.insert(returnInspections).values({
    rentalItemId: itemQuan.id, motorcycleId: bikeId('BM-006'), performedByUserId: adminUser.id, odometer: 15500, fuelLevel: '1/2', checklist: { helmets: 1, damage: 'Left mirror slightly loose' }, damageNotes: 'Left mirror slightly loose, tightened on the spot.', createdAt: at(-13),
  })

  await db.insert(documentCustodies).values({
    clientId: daniel.id, documentType: 'passport', maskedNumber: 'C01X00***', status: 'held', receivedAt: at(-1), receivedByUserId: adminUser.id, notes: 'Original passport kept during the tour.',
  })

  const yukiPassport = expectRow((await db.insert(documentCustodies).values({
    clientId: yuki.id, documentType: 'passport', maskedNumber: 'TR12****', status: 'held', receivedAt: at(-2), receivedByUserId: adminUser.id,
  }).returning())[0], 'Could not create passport custody for Yuki')

  await db.insert(documentCustodies).values({
    clientId: quan.id, documentType: 'CCCD', maskedNumber: '0012****589', status: 'returned', receivedAt: at(-20), returnedAt: at(-13), receivedByUserId: adminUser.id, returnedByUserId: adminUser.id,
  })

  await db.insert(deposits).values([
    { clientId: hung.id, agreementId: agreementHung.id, type: 'cash', status: 'held', amountMinor: 2000000, receivedAt: at(-3), notes: 'Cash deposit, receipt no. 0021.' },
    { clientId: daniel.id, agreementId: agreementDaniel.id, type: 'cash', status: 'held', amountMinor: 3000000, receivedAt: at(-1), notes: 'Cash deposit for the tour.' },
    { clientId: quan.id, agreementId: agreementQuan.id, type: 'cash', status: 'returned', amountMinor: 1500000, receivedAt: at(-20), returnedAt: at(-13) },
    { clientId: yuki.id, agreementId: agreementYuki.id, type: 'document_custody', status: 'held', documentCustodyId: yukiPassport.id, receivedAt: at(-2), notes: 'Passport kept as deposit.' },
  ])

  const obligationQuan = expectRow((await db.insert(obligations).values({
    clientId: quan.id, agreementId: agreementQuan.id, rentalItemId: itemQuan.id, type: 'rent', amountMinor: 1540000, dueDate: at(-13),
  }).returning())[0], 'Could not create obligation for Quân')

  const obligationHung = expectRow((await db.insert(obligations).values({
    clientId: hung.id, agreementId: agreementHung.id, rentalItemId: itemHung.id, type: 'rent', amountMinor: 2450000, dueDate: at(4),
  }).returning())[0], 'Could not create obligation for Hùng')

  await db.insert(obligations).values({
    clientId: daniel.id, agreementId: agreementDaniel.id, rentalItemId: itemDaniel.id, type: 'rent', amountMinor: 2800000, dueDate: at(-1), notes: 'Rental fee due at pickup.',
  })

  const receiptQuan = expectRow((await db.insert(receipts).values({
    clientId: quan.id, amountMinor: 1540000, method: 'cash', receivedAt: at(-13),
  }).returning())[0], 'Could not create receipt for Quân')

  const receiptHung = expectRow((await db.insert(receipts).values({
    clientId: hung.id, amountMinor: 1000000, method: 'bank transfer', receivedAt: at(-1), notes: 'Partial payment at pickup.',
  }).returning())[0], 'Could not create receipt for Hùng')

  await db.insert(allocations).values([
    { receiptId: receiptQuan.id, obligationId: obligationQuan.id, amountMinor: 1540000 },
    { receiptId: receiptHung.id, obligationId: obligationHung.id, amountMinor: 1000000 },
  ])

  await db.insert(incidents).values([
    { motorcycleId: bikeId('BM-004'), clientId: hung.id, title: 'Flat tire near Long Bien bridge', description: 'Customer reported a flat rear tire. Roadside assistance arranged, tire patched.', status: 'investigating', priority: 'high', assignedUserId: adminUser.id, createdAt: at(-1), updatedAt: at(-1) },
    { motorcycleId: bikeId('BM-009'), title: 'Chain slipping under load', status: 'open', priority: 'medium', createdAt: at(-2) },
    { motorcycleId: bikeId('BM-006'), clientId: quan.id, title: 'Left mirror loose on return', description: 'Tightened mirror, no replacement needed.', status: 'resolved', priority: 'low', createdAt: at(-13), updatedAt: at(-12) },
  ])

  await db.insert(maintenanceOrders).values([
    { motorcycleId: bikeId('BM-003'), type: 'service', status: 'in_progress', dueDate: at(0), costMinor: 650000, notes: 'Chain replacement and brake pads.' },
    { motorcycleId: bikeId('BM-010'), type: 'inspection', status: 'planned', dueDate: at(2), notes: 'Full inspection before re-rent.' },
    { motorcycleId: bikeId('BM-008'), type: 'repair', status: 'completed', dueDate: at(-5), costMinor: 150000, notes: 'Chain adjustment.' },
  ])

  console.log('Seeded demo dataset: 7 clients, 5 agreements, deposits, obligations, incidents and maintenance')
}

await closeDb()
console.log(`Seeded ${fixtures.length} motorcycle fixtures`)
console.log('Local QR deep links:')
for (const link of qrDeepLinks) {
  console.log(link)
}
