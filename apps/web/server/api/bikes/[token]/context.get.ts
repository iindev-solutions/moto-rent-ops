import { and, desc, eq } from 'drizzle-orm'
import { getDb, motorcycles, qrIdentities, qrPayloads, rentalItems, rentalAgreements, clients, deposits, obligations, receipts } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'
import { canAccessLocation, requireAppUser } from '../../../../server/utils/auth'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

  const db = await getDb()
  const tokenHash = hashLocatorToken(token)

  try {
    const [bike] = await db
      .select()
      .from(qrPayloads)
      .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
      .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
      .where(and(eq(qrPayloads.tokenHash, tokenHash), eq(qrPayloads.status, 'active')))
      .limit(1)
      .then(rows => rows.map(r => r.motorcycles))

    if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Bike not found' })

    const items = await db
      .select({
        id: rentalItems.id,
        agreementId: rentalItems.agreementId,
        startDate: rentalItems.startDate,
        endDate: rentalItems.endDate,
        dailyRateMinor: rentalItems.dailyRateMinor,
        currency: rentalItems.currency,
        status: rentalItems.status,
      })
      .from(rentalItems)
      .where(eq(rentalItems.motorcycleId, bike.id))
      .orderBy(desc(rentalItems.createdAt))
      .limit(10)

    const item = items.find(entry => entry.status === 'active') ?? items.find(entry => entry.status === 'planned') ?? null

    let activeRental = null
    let clientDeposits: any[] = []
    let clientObligations: any[] = []
    let clientReceipts: any[] = []

    if (item) {
      const [agreement] = await db.select().from(rentalAgreements).where(eq(rentalAgreements.id, item.agreementId)).limit(1)
      const [client] = agreement ? await db.select().from(clients).where(eq(clients.id, agreement.clientId)).limit(1) : [null]
      activeRental = {
        itemId: item.id,
        agreementId: item.agreementId,
        status: item.status,
        startDate: item.startDate.toISOString(),
        endDate: item.endDate.toISOString(),
        dailyRateMinor: item.dailyRateMinor,
        currency: item.currency,
        agreementStatus: agreement?.status ?? null,
        client: client ? { id: client.id, displayName: client.displayName } : null,
      }

      if (agreement) {
        clientDeposits = await db.select().from(deposits).where(eq(deposits.agreementId, agreement.id))
        clientObligations = await db.select().from(obligations).where(eq(obligations.agreementId, agreement.id))
      }
      if (client) {
        clientReceipts = await db.select().from(receipts).where(eq(receipts.clientId, client.id)).orderBy(desc(receipts.receivedAt)).limit(10)
      }
    }

    return {
      bike,
      activeRental,
      deposits: clientDeposits.map(d => ({ ...d, receivedAt: d.receivedAt.toISOString(), returnedAt: d.returnedAt ? d.returnedAt.toISOString() : null })),
      obligations: clientObligations.map(o => ({ ...o, dueDate: o.dueDate ? o.dueDate.toISOString() : null, createdAt: o.createdAt.toISOString() })),
      receipts: clientReceipts.map(r => ({ ...r, receivedAt: r.receivedAt.toISOString(), createdAt: r.createdAt.toISOString() })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
