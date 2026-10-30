import { setup, url } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const telegramRequests: string[] = []
let telegramFail = false
const telegramServer = createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    telegramRequests.push(body)
    res.setHeader('content-type', 'application/json')
    if (telegramFail) {
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, description: 'mock Telegram failure' }))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify({ ok: true, result: { message_id: telegramRequests.length } }))
  })
})
await new Promise<void>((resolve, reject) => {
  telegramServer.once('error', reject)
  telegramServer.listen(0, '127.0.0.1', () => resolve())
})
const telegramPort = (telegramServer.address() as AddressInfo).port
process.env.TELEGRAM_BOT_TOKEN = 'test-token'
process.env.TELEGRAM_CHAT_ID = 'test-chat'
process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${telegramPort}`
process.env.OUTBOX_WORKER_SECRET = 'test-outbox-secret'
process.env.OUTBOX_MAX_ATTEMPTS = '2'
process.env.OUTBOX_RETRY_BASE_MS = '0'
afterAll(() => {
  telegramServer.close()
})

await setup({ dev: true })

type Json = Record<string, any>

let cookie = ''
let firstRental: Json = {}
let extensionAgreementId = ''

interface ApiResult {
  status: number
  data: Json
}

async function api(path: string, options: { method?: string, json?: unknown, headers?: Record<string, string> } = {}): Promise<ApiResult> {
  const response = await fetch(url(path), {
    method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
    headers: {
      ...(options.json === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...options.headers,
    },
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  })
  const text = await response.text()
  let data: Json = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  return { status: response.status, data }
}

async function login() {
  const response = await fetch(url('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    }),
  })
  expect(response.status).toBe(200)
  const setCookies = response.headers.getSetCookie()
  const sessionCookie = setCookies.find(value => value.startsWith('nuxt-session='))
  expect(sessionCookie, 'login must set the nuxt-session cookie').toBeTruthy()
  cookie = sessionCookie!.split(';')[0]!
}

async function bikeByCode(assetCode: string) {
  const { status, data } = await api('/api/bikes')
  expect(status).toBe(200)
  const bike = (data.bikes as Json[]).find(row => row.assetCode === assetCode)
  expect(bike, `seed must contain ${assetCode}`).toBeTruthy()
  return bike!
}

describe('rental lifecycle', () => {
  it('rejects unauthenticated API access', async () => {
    const { status } = await api('/api/bikes')
    expect(status).toBe(401)
    expect((await api('/api/payments')).status).toBe(401)
  })

  it('sets browser hardening headers', async () => {
    const response = await fetch(url('/login'))
    expect(response.status).toBe(200)
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-permitted-cross-domain-policies')).toBe('none')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('permissions-policy')).toContain('camera=(self)')
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
  })

  it('exposes a database health probe without private data', async () => {
    const response = await fetch(url('/api/health'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'book-moto-web',
      database: 'ok',
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('logs the seeded owner in', async () => {
    await login()
  })

  it('login sets a session cookie the browser keeps over plain HTTP', async () => {
    // Regression: the session cookie used to be marked `Secure`, which browsers
    // silently drop on plain HTTP, so login from a LAN origin never stuck.
    const response = await fetch(url('/api/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.SEED_ADMIN_EMAIL,
        password: process.env.SEED_ADMIN_PASSWORD,
      }),
    })
    expect(response.status).toBe(200)
    const setCookies = response.headers.getSetCookie()
    const sessionCookie = setCookies.find(value => value.startsWith('nuxt-session='))
    expect(sessionCookie, 'login must set the nuxt-session cookie').toBeTruthy()
    const attributes = sessionCookie!.split(';').slice(1).map(part => part.trim().toLowerCase())
    expect(attributes).not.toContain('secure')

    // The cookie must round-trip: sending it back must return the session user.
    const session = await fetch(url('/api/_auth/session'), {
      headers: { cookie: sessionCookie!.split(';')[0]! },
    })
    expect(session.status).toBe(200)
    const sessionSchema = z.object({ user: z.object({ id: z.string() }) })
    const parsed = sessionSchema.safeParse(await session.json())
    expect(parsed.success, 'session must contain the logged-in user').toBe(true)
  })

  it('persists login throttling in the database after ten failures', async () => {
    const email = 'rate-limit-probe@moto.test'
    const statuses: number[] = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await fetch(url('/api/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401))
    expect(statuses[10]).toBe(429)
  })

  it('returns monthly payments with payer names and a month filter', async () => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const current = await api(`/api/payments?month=${month}`)
    expect(current.status).toBe(200)
    expect(current.data.month).toBe(month)
    expect(Array.isArray(current.data.receipts)).toBe(true)
    expect(Array.isArray(current.data.due)).toBe(true)
    expect(current.data.totals.receivedMinor).toBe(current.data.receipts.reduce((total: number, row: Json) => total + row.amountMinor, 0))

    for (const row of current.data.receipts) {
      expect(row.clientName).toBeTruthy()
      expect(row.receivedAt).toBeTruthy()
      expect(row.method).toBeTruthy()
    }
    for (const row of current.data.due) {
      expect(row.clientName).toBeTruthy()
      expect(row.dueDate).toBeTruthy()
      expect(row.balanceMinor).toBeGreaterThan(0)
    }

    const empty = await api('/api/payments?month=2000-01')
    expect(empty.status).toBe(200)
    expect(empty.data.month).toBe('2000-01')
    expect(empty.data.receipts).toEqual([])
    expect(empty.data.due).toEqual([])
    expect(empty.data.totals).toEqual({ receivedMinor: 0, dueMinor: 0, overdueMinor: 0 })
  })

  it('exposes upcoming payments on the dashboard', async () => {
    const { status, data } = await api('/api/dashboard')
    expect(status).toBe(200)
    expect(Array.isArray(data.upcomingPayments)).toBe(true)
    expect(data.upcomingPayments.length).toBeGreaterThan(0)
    for (const row of data.upcomingPayments) {
      expect(row.clientName).toBeTruthy()
      expect(row.balanceMinor).toBeGreaterThan(0)
      expect(new Date(row.dueDate).getTime()).toBeGreaterThanOrEqual(new Date().setHours(0, 0, 0, 0))
    }
  })

  it('rejects non-positive obligation amounts at the API boundary', async () => {
    expect((await api('/api/obligations', { json: { type: 'rent', amountMinor: 0 } })).status).toBe(400)
    expect((await api('/api/obligations', { json: { type: 'rent', amountMinor: -100 } })).status).toBe(400)
    expect((await api('/api/rentals/quick', { json: { motorcycleId: '00000000-0000-4000-8000-000000000000', days: 2, dailyRateMinor: 0 } })).status).toBe(400)
  })

  it('normalizes obligation currency codes to uppercase', async () => {
    const created = await api('/api/obligations', { json: { type: 'rent_extension', amountMinor: 1000, currency: 'vnd' } })
    expect(created.status).toBe(200)
    expect(created.data.obligation.currency).toBe('VND')
  })

  it('returns 404 for unknown rental items and deposits', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000'
    expect((await api(`/api/rentals/items/${unknown}/settlement`)).status).toBe(404)
    expect((await api(`/api/rentals/items/${unknown}/extend`, { json: { days: 1 } })).status).toBe(404)
    expect((await api(`/api/deposits/${unknown}/return`, { json: {} })).status).toBe(404)
  })

  it('creates a quick rental with handover, rent obligation and cash deposit', async () => {
    const bike = await bikeByCode('BM-001')
    const { status, data } = await api('/api/rentals/quick', {
      json: {
        newClient: { displayName: 'Test Rider', phone: '+84 900 000 001' },
        motorcycleId: bike.id,
        days: 3,
        dailyRateMinor: 150_000,
      },
    })

    expect(status).toBe(200)
    expect(data.rental.agreementId).toBeTruthy()
    expect(data.rental.itemId).toBeTruthy()
    expect(data.rental.handoverId).toBeTruthy()
    expect(data.rental.depositId).toBeTruthy()
    firstRental = data.rental

    const after = await bikeByCode('BM-001')
    expect(after.status).toBe('rented')
  })

  it('does not allow a second rental on an occupied bike', async () => {
    const bike = await bikeByCode('BM-001')
    const { status } = await api('/api/rentals/quick', {
      json: {
        newClient: { displayName: 'Second Rider', phone: '+84 900 000 002' },
        motorcycleId: bike.id,
        days: 1,
        dailyRateMinor: 100_000,
      },
    })
    expect(status).toBe(409)
  })

  it('computes the settlement from unpaid obligations only', async () => {
    const itemId = firstRental.itemId
    const { status, data } = await api(`/api/rentals/items/${itemId}/settlement`)

    expect(status).toBe(200)
    expect(data.settlement.totalDueMinor).toBe(450_000)
    expect(data.settlement.obligations).toHaveLength(1)
    expect(data.settlement.deposit.amountMinor).toBe(2_000_000)
    expect(data.settlement.deposit.status).toBe('held')
  })

  it('rejects an allocation above the remaining obligation balance', async () => {
    const itemId = firstRental.itemId
    const settlement = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    const obligationId = settlement.obligations[0].id

    const { status } = await api('/api/receipts', {
      json: {
        clientId: settlement.clientId,
        amountMinor: 500_000,
        method: 'cash',
        allocations: [{ obligationId, amountMinor: 500_000 }],
      },
    })
    expect(status).toBe(409)
  })

  it('records a partial payment and reduces the amount due', async () => {
    const itemId = firstRental.itemId
    const settlement = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    const obligationId = settlement.obligations[0].id

    const { status } = await api('/api/receipts', {
      json: {
        clientId: settlement.clientId,
        amountMinor: 200_000,
        method: 'cash',
        allocations: [{ obligationId, amountMinor: 200_000 }],
      },
    })
    expect(status).toBe(200)

    const after = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    expect(after.totalDueMinor).toBe(250_000)
  })

  it('applies the deposit to the remaining rent and keeps the rest held', async () => {
    const itemId = firstRental.itemId
    const settlement = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    const obligationId = settlement.obligations.find((row: Json) => row.type === 'rent').id

    const { status, data } = await api(`/api/deposits/${settlement.deposit.id}/apply`, {
      json: { obligationId },
    })
    expect(status).toBe(200)
    expect(data.amountMinor).toBe(250_000)
    expect(data.remainingDepositMinor).toBe(1_750_000)

    const after = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    expect(after.totalDueMinor).toBe(0)
    expect(after.deposit.status).toBe('held')
    expect(after.deposit.remainingMinor).toBe(1_750_000)
  })

  it('returns the bike and marks the agreement returned', async () => {
    const itemId = firstRental.itemId
    const { status, data } = await api(`/api/rentals/items/${itemId}/return`, {
      json: { odometer: 13_000, fuelLevel: 'full', checklist: { helmets: 2 } },
    })
    expect(status).toBe(200)
    expect(data.returned).toBe(true)

    const bike = await bikeByCode('BM-001')
    expect(bike.status).toBe('available')

    const settlement = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    expect(settlement.itemStatus).toBe('returned')
    expect(settlement.agreementStatus).toBe('returned')
  })

  it('rejects a duplicate return and an extension after return', async () => {
    const itemId = firstRental.itemId
    expect((await api(`/api/rentals/items/${itemId}/return`, { json: {} })).status).toBe(409)
    expect((await api(`/api/rentals/items/${itemId}/extend`, { json: { days: 1 } })).status).toBe(409)
  })

  it('closes the returned agreement exactly once', async () => {
    const agreementId = firstRental.agreementId
    expect((await api(`/api/agreements/${agreementId}/close`, { json: { reason: 'Bike returned clean' } })).status).toBe(200)
    expect((await api(`/api/agreements/${agreementId}/close`, { json: {} })).status).toBe(409)
  })

  it('returns the deposit and releases the remaining balance', async () => {
    const itemId = firstRental.itemId
    const before = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement

    expect((await api(`/api/deposits/${before.deposit.id}/return`, { json: {} })).status).toBe(200)
    expect((await api(`/api/deposits/${before.deposit.id}/return`, { json: {} })).status).toBe(409)

    const after = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    expect(after.deposit.status).toBe('returned')
    expect(after.deposit.remainingMinor).toBe(0)
  })
})

describe('deposit scoping', () => {
  it('keeps deposits attached to their own agreement for the same client', async () => {
    const bikeA = await bikeByCode('BM-006')
    const first = await api('/api/rentals/quick', {
      json: {
        newClient: { displayName: 'Deposit Scope Rider', phone: '+84 900 000 003' },
        motorcycleId: bikeA.id,
        days: 2,
        dailyRateMinor: 100_000,
        depositAmountMinor: 1_000_000,
      },
    })
    expect(first.status).toBe(200)

    const bikeB = await bikeByCode('BM-001')
    const second = await api('/api/rentals/quick', {
      json: {
        clientId: first.data.rental.clientId,
        motorcycleId: bikeB.id,
        days: 1,
        dailyRateMinor: 100_000,
        depositAmountMinor: 2_000_000,
      },
    })
    expect(second.status).toBe(200)

    const settlementA = (await api(`/api/rentals/items/${first.data.rental.itemId}/settlement`)).data.settlement
    const settlementB = (await api(`/api/rentals/items/${second.data.rental.itemId}/settlement`)).data.settlement

    expect(settlementA.deposit.id).toBe(first.data.rental.depositId)
    expect(settlementA.deposit.amountMinor).toBe(1_000_000)
    expect(settlementB.deposit.id).toBe(second.data.rental.depositId)
    expect(settlementB.deposit.amountMinor).toBe(2_000_000)
  })

  it('extends an active rental with a separate rent_extension obligation', async () => {
    const bike = await bikeByCode('BM-008')
    const rental = await api('/api/rentals/quick', {
      json: {
        newClient: { displayName: 'Extension Rider', phone: '+84 900 000 004' },
        motorcycleId: bike.id,
        days: 2,
        dailyRateMinor: 120_000,
      },
    })
    expect(rental.status).toBe(200)
    extensionAgreementId = rental.data.rental.agreementId

    const itemId = rental.data.rental.itemId
    const before = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    expect(before.totalDueMinor).toBe(240_000)
    expect(before.obligations).toHaveLength(1)
    const originalRent = before.obligations[0]

    const extended = await api(`/api/rentals/items/${itemId}/extend`, { json: { days: 2 } })
    expect(extended.status).toBe(200)
    expect(extended.data.extensionAmountMinor).toBe(240_000)

    const after = (await api(`/api/rentals/items/${itemId}/settlement`)).data.settlement
    expect(after.totalDueMinor).toBe(480_000)
    expect(after.obligations).toHaveLength(2)
    const unchangedRent = after.obligations.find((row: Json) => row.type === 'rent')
    const extension = after.obligations.find((row: Json) => row.type === 'rent_extension')
    expect(unchangedRent.id).toBe(originalRent.id)
    expect(unchangedRent.amountMinor).toBe(240_000)
    expect(extension.amountMinor).toBe(240_000)

    // Free the bike again so the concurrency test below has an available target.
    expect((await api(`/api/rentals/items/${itemId}/return`, { json: {} })).status).toBe(200)
  })

  it('lets only one of two concurrent quick rentals win the same bike', async () => {
    const bike = await bikeByCode('BM-008')
    const body = {
      newClient: { displayName: 'Race Rider', phone: '+84 900 000 005' },
      motorcycleId: bike.id,
      days: 1,
      dailyRateMinor: 100_000,
    }
    const [left, right] = await Promise.all([
      api('/api/rentals/quick', { json: body }),
      api('/api/rentals/quick', { json: body }),
    ])
    expect([left.status, right.status].sort((a, b) => a - b)).toEqual([200, 409])
  })
})

describe('document expiry and handover blocking', () => {
  let expiryClientId = ''
  let expiryDocumentId = ''

  it('rejects an expired passport at quick rental intake', async () => {
    const bike = await bikeByCode('BM-001')
    const { status, data } = await api('/api/rentals/quick', {
      json: {
        newClient: { displayName: 'Expired Passport Rider', phone: '+84 900 000 006' },
        motorcycleId: bike.id,
        days: 2,
        dailyRateMinor: 100_000,
        depositType: 'document_custody',
        passportMaskedNumber: 'P-EXPIRED',
        passportExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    })
    expect(status).toBe(400)
    expect(JSON.stringify(data).toLowerCase()).toContain('expired')
  })

  it('records a future expiry and rejects receiving an expired document', async () => {
    const created = await api('/api/people', {
      json: {
        displayName: 'Expiry Rider',
        contacts: [{ channel: 'phone', value: '+84 900 000 007', isPrimary: true }],
      },
    })
    expect(created.status).toBe(200)
    expiryClientId = created.data.client.id

    const future = new Date(Date.now() + 60 * 86_400_000)
    const received = await api(`/api/people/${expiryClientId}/documents`, {
      json: { documentType: 'passport', maskedNumber: 'X-999', expiresAt: future.toISOString() },
    })
    expect(received.status).toBe(200)
    expiryDocumentId = received.data.document.id

    const detail = await api(`/api/people/${expiryClientId}`)
    const doc = (detail.data.documents as Json[]).find(row => row.id === expiryDocumentId)
    expect(doc?.expiresAt).toBe(future.toISOString())
    expect(doc?.expiryStatus).toBe('valid')

    const all = await api('/api/documents')
    expect((all.data.documents as Json[]).find(row => row.id === expiryDocumentId)?.expiryStatus).toBe('valid')

    const pastReceive = await api(`/api/people/${expiryClientId}/documents`, {
      json: { documentType: 'passport', expiresAt: new Date(Date.now() - 86_400_000).toISOString() },
    })
    expect(pastReceive.status).toBe(400)
  })

  it('moves a document through expiring-soon and expired states via PATCH', async () => {
    const soonUpdate = await api(`/api/documents/${expiryDocumentId}`, {
      method: 'PATCH',
      json: { expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString() },
    })
    expect(soonUpdate.status).toBe(200)
    expect(soonUpdate.data.document.expiryStatus).toBe('expiring_soon')

    const expiredUpdate = await api(`/api/documents/${expiryDocumentId}`, {
      method: 'PATCH',
      json: { expiresAt: new Date(Date.now() - 86_400_000).toISOString() },
    })
    expect(expiredUpdate.status).toBe(200)
    expect(expiredUpdate.data.document.expiryStatus).toBe('expired')

    const all = await api('/api/documents')
    expect((all.data.documents as Json[]).find(row => row.id === expiryDocumentId)?.expiryStatus).toBe('expired')
  })

  it('blocks handover with an expired held document and allows it after renewal', async () => {
    const active = await api('/api/rentals/active')
    const running = (active.data.rentals as Json[]).find(row => row.assetCode === 'BM-008')
    expect(running, 'the concurrency test must leave BM-008 rented').toBeTruthy()
    expect((await api(`/api/rentals/items/${running!.itemId}/return`, { json: {} })).status).toBe(200)

    const bike = await bikeByCode('BM-008')
    expect(bike.status).toBe('available')

    const start = new Date(Date.now() + 86_400_000)
    const end = new Date(start.getTime() + 2 * 86_400_000)
    const agreement = await api(`/api/people/${expiryClientId}/agreements`, {
      json: { startDate: start.toISOString(), endDate: end.toISOString() },
    })
    expect(agreement.status).toBe(200)
    const agreementId = agreement.data.agreement.id

    const item = await api(`/api/agreements/${agreementId}/items`, {
      json: { motorcycleId: bike.id, startDate: start.toISOString(), endDate: end.toISOString(), dailyRateMinor: 100_000 },
    })
    expect(item.status).toBe(200)
    const itemId = item.data.item.id

    const drafted = await api(`/api/agreements/${agreementId}`)
    expect(drafted.data.blockers).toContain('The received document is expired')

    expect((await api(`/api/agreements/${agreementId}/ready`, { json: {} })).status).toBe(200)

    const blocked = await api(`/api/rentals/items/${itemId}/handover`, { json: { odometer: 1000 } })
    expect(blocked.status).toBe(409)

    const renewed = await api(`/api/documents/${expiryDocumentId}`, {
      method: 'PATCH',
      json: { expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() },
    })
    expect(renewed.status).toBe(200)

    const handover = await api(`/api/rentals/items/${itemId}/handover`, { json: { odometer: 1000 } })
    expect(handover.status).toBe(200)
    expect(handover.data.handedOver).toBe(true)
    expect((await bikeByCode('BM-008')).status).toBe('rented')
  })
})

describe('location history', () => {
  it('records an append-only move on the bike card and rejects invalid moves', async () => {
    const bikes = await api('/api/bikes')
    const bike = (bikes.data.bikes as Json[]).find(row => row.assetCode === 'BM-007')
    expect(bike, 'seed must contain BM-007').toBeTruthy()
    const token = bike!.qrToken as string
    expect(token).toBeTruthy()

    const before = await api(`/api/bikes/${encodeURIComponent(token)}/locations`)
    expect(before.status).toBe(200)
    const baseline = (before.data.locations as Json[])[0]
    expect(baseline.location).toBe('Đà Nẵng')
    expect(baseline.endedAt).toBeNull()

    const moved = await api(`/api/bikes/${encodeURIComponent(token)}/location`, {
      json: { location: 'Workshop', note: 'Chain inspection' },
    })
    expect(moved.status).toBe(200)

    const after = await api(`/api/bikes/${encodeURIComponent(token)}/locations`)
    const entries = after.data.locations as Json[]
    expect(entries).toHaveLength(2)
    expect(entries[0].location).toBe('Workshop')
    expect(entries[0].endedAt).toBeNull()
    expect(entries[0].note).toBe('Chain inspection')
    expect(entries[1].location).toBe('Đà Nẵng')
    expect(entries[1].endedAt).toBe(entries[0].startedAt)

    const card = await api(`/api/bikes/${encodeURIComponent(token)}`)
    expect(card.data.location).toBe('Workshop')

    const same = await api(`/api/bikes/${encodeURIComponent(token)}/location`, { json: { location: 'Workshop' } })
    expect(same.status).toBe(409)

    const invalid = await api(`/api/bikes/${encodeURIComponent(token)}/location`, { json: { location: ' ' } })
    expect(invalid.status).toBe(400)

    const list = await api('/api/bikes')
    expect((list.data.bikes as Json[]).find(row => row.assetCode === 'BM-007')?.location).toBe('Workshop')
  })
})

describe('list pagination', () => {
  it('paginates people, bikes, incidents and maintenance lists', async () => {
    const firstPeople = await api('/api/people?limit=2&offset=0')
    expect(firstPeople.status).toBe(200)
    expect(firstPeople.data.clients).toHaveLength(2)
    expect(firstPeople.data.limit).toBe(2)
    expect(firstPeople.data.total).toBeGreaterThanOrEqual(7)
    expect(firstPeople.data.hasMore).toBe(true)

    const nextPeople = await api('/api/people?limit=2&offset=2')
    const firstIds = (firstPeople.data.clients as Json[]).map(row => row.id)
    const nextIds = (nextPeople.data.clients as Json[]).map(row => row.id)
    expect(nextIds).toHaveLength(2)
    expect(nextIds.some(id => firstIds.includes(id))).toBe(false)

    const clamped = await api('/api/people?limit=1000')
    expect(clamped.data.limit).toBe(200)

    const firstBikes = await api('/api/bikes?limit=3&offset=0')
    expect(firstBikes.data.bikes).toHaveLength(3)
    expect(firstBikes.data.total).toBe(10)
    expect(firstBikes.data.hasMore).toBe(true)
    const nextBikes = await api('/api/bikes?limit=3&offset=3')
    const firstBikeIds = (firstBikes.data.bikes as Json[]).map(row => row.id)
    const nextBikeIds = (nextBikes.data.bikes as Json[]).map(row => row.id)
    expect(nextBikeIds.some(id => firstBikeIds.includes(id))).toBe(false)

    const search = await api('/api/bikes?search=BM-007')
    expect(search.data.bikes).toHaveLength(1)
    expect(search.data.bikes[0].assetCode).toBe('BM-007')
    expect(search.data.total).toBe(1)

    const incidents = await api('/api/incidents?limit=1')
    expect(incidents.data.incidents).toHaveLength(1)
    expect(incidents.data.total).toBeGreaterThanOrEqual(3)
    expect(incidents.data.hasMore).toBe(true)

    const maintenance = await api('/api/maintenance?limit=1')
    expect(maintenance.data.orders).toHaveLength(1)
    expect(maintenance.data.total).toBeGreaterThanOrEqual(3)

    const unordered = await api('/api/bikes?limit=2&offset=-4')
    expect(unordered.data.offset).toBe(0)
    expect(unordered.data.bikes).toHaveLength(2)
  })
})

describe('agreement version history', () => {
  it('appends immutable versions for every material agreement change', async () => {
    const active = await api('/api/rentals/active')
    const seedRental = (active.data.rentals as Json[]).find(row => row.assetCode === 'BM-004')
    expect(seedRental, 'the seed must keep BM-004 on an active rental').toBeTruthy()
    expect((await api(`/api/rentals/items/${seedRental!.itemId}/return`, { json: {} })).status).toBe(200)

    const documentRental = (active.data.rentals as Json[]).find(row => row.assetCode === 'BM-008')
    expect(documentRental, 'the document test must leave BM-008 rented').toBeTruthy()
    expect((await api(`/api/rentals/items/${documentRental!.itemId}/return`, { json: {} })).status).toBe(200)

    expect((await bikeByCode('BM-004')).status).toBe('available')
    expect((await bikeByCode('BM-008')).status).toBe('available')

    const created = await api('/api/people', {
      json: {
        displayName: 'Version Rider',
        contacts: [{ channel: 'phone', value: '+84 900 000 008', isPrimary: true }],
      },
    })
    expect(created.status).toBe(200)
    const clientId = created.data.client.id as string

    const document = await api(`/api/people/${clientId}/documents`, {
      json: { documentType: 'passport', maskedNumber: 'V-001', expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() },
    })
    expect(document.status).toBe(200)

    const start = new Date(Date.now() + 30 * 86_400_000)
    const end = new Date(start.getTime() + 7 * 86_400_000)
    const agreement = await api(`/api/people/${clientId}/agreements`, {
      json: { startDate: start.toISOString(), endDate: end.toISOString(), notes: 'Versioned contract' },
    })
    expect(agreement.status).toBe(200)
    const agreementId = agreement.data.agreement.id as string
    expect(agreement.data.agreement.version).toBe(1)

    const first = await api(`/api/agreements/${agreementId}/items`, {
      json: { motorcycleId: (await bikeByCode('BM-004')).id, startDate: start.toISOString(), endDate: end.toISOString(), dailyRateMinor: 100_000 },
    })
    expect(first.status).toBe(200)
    const second = await api(`/api/agreements/${agreementId}/items`, {
      json: { motorcycleId: (await bikeByCode('BM-008')).id, startDate: start.toISOString(), endDate: end.toISOString(), dailyRateMinor: 120_000 },
    })
    expect(second.status).toBe(200)
    const firstItemId = first.data.item.id as string
    const secondItemId = second.data.item.id as string

    expect((await api(`/api/agreements/${agreementId}/ready`, { json: {} })).status).toBe(200)
    expect((await api(`/api/rentals/items/${firstItemId}/handover`, { json: { odometer: 5000 } })).status).toBe(200)
    expect((await api(`/api/rentals/items/${firstItemId}/return`, { json: { odometer: 5200 } })).status).toBe(200)
    expect((await api(`/api/rentals/items/${secondItemId}/handover`, { json: { odometer: 5100 } })).status).toBe(200)
    expect((await api(`/api/rentals/items/${secondItemId}/return`, { json: { odometer: 5300 } })).status).toBe(200)
    expect((await api(`/api/agreements/${agreementId}/close`, { json: { reason: 'Version history test' } })).status).toBe(200)

    const versions = await api(`/api/agreements/${agreementId}/versions`)
    expect(versions.status).toBe(200)
    const rows = versions.data.versions as Json[]
    expect(rows.map(row => row.changeReason)).toEqual([
      'closed', 'returned', 'handover', 'item_returned', 'handover', 'ready', 'item_added', 'item_added', 'created',
    ])
    expect(rows.map(row => row.version)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(rows.map(row => row.itemCount)).toEqual([2, 2, 2, 2, 2, 2, 2, 1, 0])
    expect(rows[0].status).toBe('closed')
    expect(rows[1].status).toBe('returned')
    expect(rows[3].status).toBe('active')
    expect(rows[4].status).toBe('active')
    expect(rows[5].status).toBe('ready')
    expect(rows[8].status).toBe('draft')

    const detail = await api(`/api/agreements/${agreementId}`)
    expect(detail.data.agreement.version).toBe(9)

    const quickVersions = await api(`/api/agreements/${firstRental.agreementId}/versions`)
    expect((quickVersions.data.versions as Json[]).map(row => row.changeReason)).toEqual(['closed', 'returned', 'created'])

    const extensionVersions = await api(`/api/agreements/${extensionAgreementId}/versions`)
    expect((extensionVersions.data.versions as Json[]).map(row => row.changeReason)).toEqual(['returned', 'extended', 'created'])

    expect((await api('/api/agreements/00000000-0000-4000-8000-000000000000/versions')).status).toBe(404)
  })
})

describe('document PII access auditing', () => {
  it('audits masked requisites disclosure and custody reads', async () => {
    const people = await api('/api/people?limit=50')
    const expiryClient = (people.data.clients as Json[]).find(client => client.displayName === 'Expiry Rider')
    expect(expiryClient, 'the document test must create Expiry Rider').toBeTruthy()

    const detail = await api(`/api/people/${expiryClient!.id}`)
    expect(detail.status).toBe(200)
    const document = (detail.data.documents as Json[]).find(row => row.maskedNumber)
    expect(document, 'Expiry Rider must hold a document with a masked number').toBeTruthy()

    const peopleAudit = await api(`/api/audit?action=document.masked_requisites_viewed&entityId=${document!.id}`)
    expect(peopleAudit.status).toBe(200)
    expect((peopleAudit.data.events as Json[]).some(row => row.metadata.source === 'people.detail')).toBe(true)

    expect((await api('/api/documents')).status).toBe(200)
    const listAudit = await api(`/api/audit?action=document.masked_requisites_viewed&entityId=${document!.id}`)
    expect((listAudit.data.events as Json[]).some(row => row.metadata.source === 'documents.list')).toBe(true)

    const agreements = detail.data.agreements as Json[]
    expect(agreements).toHaveLength(1)
    const agreementDetail = await api(`/api/agreements/${agreements[0].id}`)
    const itemId = (agreementDetail.data.items as Json[])[0].id as string
    const settlement = await api(`/api/rentals/items/${itemId}/settlement`)
    expect(settlement.status).toBe(200)
    expect(settlement.data.settlement.document).toBeTruthy()
    const custodyId = settlement.data.settlement.document.id as string

    const custodyAudit = await api(`/api/audit?action=document.custody_viewed&entityId=${custodyId}`)
    expect(custodyAudit.status).toBe(200)
    expect((custodyAudit.data.events as Json[]).some(row => row.metadata.source === 'settlement')).toBe(true)

    expect((await api('/api/audit?entityId=not-a-uuid')).status).toBe(400)
  })
})

describe('manual locator codes', () => {
  it('resolves a bike by its short printed code, including formatted input', async () => {
    const list = await api('/api/bikes?limit=200')
    const bike = (list.data.bikes as Json[]).find(row => row.assetCode === 'BM-010')
    expect(bike, 'seed must contain BM-010').toBeTruthy()
    expect(typeof bike!.manualCode).toBe('string')
    expect(bike!.manualCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/)

    const detail = await api(`/api/bikes/${encodeURIComponent(bike!.manualCode)}`)
    expect(detail.status).toBe(200)
    expect(detail.data.id).toBe(bike!.id)
    expect(detail.data.manualCode).toBe(bike!.manualCode)

    const code = bike!.manualCode as string
    const typed = `${code.slice(0, 5)} ${code.slice(5)}`.toLowerCase()
    expect((await api(`/api/bikes/${encodeURIComponent(typed)}/context`)).status).toBe(200)
    expect((await api(`/api/bikes/${encodeURIComponent(typed)}/locations`)).status).toBe(200)

    const svg = await fetch(url(`/api/bikes/${encodeURIComponent(code)}/qr.svg`), { headers: { cookie } })
    expect(svg.status).toBe(200)
    expect(svg.headers.get('content-type')).toContain('image/svg+xml')
  })

  it('rotates the payload, retires the old code and issues a fresh one', async () => {
    const list = await api('/api/bikes?limit=200')
    const bike = (list.data.bikes as Json[]).find(row => row.assetCode === 'BM-010')
    const oldCode = bike!.manualCode as string
    const oldToken = bike!.qrToken as string

    const rotated = await api(`/api/bikes/${encodeURIComponent(oldCode)}/rotate`, {
      json: { reason: 'e2e manual code rotation' },
    })
    expect(rotated.status).toBe(200)
    expect(rotated.data.manualCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/)
    expect(rotated.data.manualCode).not.toBe(oldCode)
    expect(rotated.data.qrToken).not.toBe(oldToken)

    expect((await api(`/api/bikes/${encodeURIComponent(oldCode)}`)).status).toBe(404)
    expect((await api(`/api/bikes/${encodeURIComponent(oldToken)}`)).status).toBe(404)

    const fresh = await api(`/api/bikes/${encodeURIComponent(rotated.data.manualCode)}`)
    expect(fresh.status).toBe(200)
    expect(fresh.data.assetCode).toBe('BM-010')

    const after = await api('/api/bikes?limit=200')
    const updated = (after.data.bikes as Json[]).find(row => row.assetCode === 'BM-010')
    expect(updated!.manualCode).toBe(rotated.data.manualCode)
    expect(updated!.qrToken).toBe(rotated.data.qrToken)
  })

  it('writes a receipt event in the same transaction and sends a non-confirming Telegram message', async () => {
    telegramFail = false
    const created = await api('/api/receipts', {
      json: { amountMinor: 123_000, currency: 'VND', method: 'cash' },
    })
    expect(created.status).toBe(200)
    const receiptId = created.data.receipt.id as string

    const list = await api(`/api/outbox?aggregateId=${receiptId}`)
    expect(list.status).toBe(200)
    expect(list.data.events).toHaveLength(1)
    const event = list.data.events[0] as Json
    expect(event).toMatchObject({
      eventType: 'receipt.recorded',
      aggregateType: 'receipt',
      aggregateId: receiptId,
      status: 'pending',
      attempts: 0,
    })
    expect(event.payload.amountMinor).toBe(123_000)
    expect(event.payload).not.toHaveProperty('passport')

    const processed = await api('/api/outbox/process', {
      method: 'POST',
      json: { limit: 100 },
      headers: { 'x-outbox-worker-secret': 'test-outbox-secret' },
    })
    expect(processed.status).toBe(200)
    expect(processed.data.configured).toBe(true)
    expect(processed.data.sent).toBeGreaterThanOrEqual(1)

    const detail = await api(`/api/outbox/${event.id}`)
    expect(detail.status).toBe(200)
    expect(detail.data.event.status).toBe('sent')
    expect(detail.data.event.attempts).toBe(1)
    expect(detail.data.attempts).toHaveLength(1)
    expect(detail.data.attempts[0].status).toBe('sent')
    expect(detail.data.attempts[0].httpStatus).toBe(200)

    const telegramText = telegramRequests
      .map(body => JSON.parse(body).text as string)
      .find(text => text.includes('123.000 VND'))
    expect(telegramText).toBeTruthy()
    expect(telegramText).toContain('not a payment confirmation')
    expect(telegramText).not.toMatch(/passport|phone|email|@/i)
  })

  it('backs off a failed Telegram send, journals it and retries without changing the receipt', async () => {
    telegramFail = true
    const created = await api('/api/receipts', {
      json: { amountMinor: 456_000, currency: 'VND', method: 'cash' },
    })
    expect(created.status).toBe(200)
    const receiptId = created.data.receipt.id as string
    const list = await api(`/api/outbox?aggregateId=${receiptId}`)
    const event = list.data.events[0] as Json

    const processed = await api('/api/outbox/process', {
      method: 'POST',
      json: { limit: 100 },
      headers: { 'x-outbox-worker-secret': 'test-outbox-secret' },
    })
    expect(processed.status).toBe(200)
    expect(processed.data.failed).toBeGreaterThanOrEqual(1)

    const failed = await api(`/api/outbox/${event.id}`)
    expect(failed.status).toBe(200)
    expect(failed.data.event.status).toBe('pending')
    expect(failed.data.event.attempts).toBe(1)
    expect(failed.data.event.lastError).toContain('mock Telegram failure')
    expect(failed.data.attempts).toHaveLength(1)
    expect(failed.data.attempts[0]).toMatchObject({ status: 'failed', httpStatus: 500 })

    telegramFail = false
    const retried = await api(`/api/outbox/${event.id}/retry`, { method: 'POST', json: {} })
    expect(retried.status).toBe(200)
    const processedAgain = await api('/api/outbox/process', {
      method: 'POST',
      json: { limit: 100 },
      headers: { 'x-outbox-worker-secret': 'test-outbox-secret' },
    })
    expect(processedAgain.status).toBe(200)

    const sent = await api(`/api/outbox/${event.id}`)
    expect(sent.data.event.status).toBe('sent')
    expect(sent.data.event.attempts).toBe(2)
    expect(sent.data.attempts.map((attempt: Json) => attempt.status)).toEqual(['failed', 'sent'])
  })

  it('dead-letters after the configured attempts and replays in a new epoch', async () => {
    telegramFail = true
    const created = await api('/api/receipts', {
      json: { amountMinor: 789_000, currency: 'VND', method: 'cash' },
    })
    expect(created.status).toBe(200)
    const receiptId = created.data.receipt.id as string
    const list = await api(`/api/outbox?aggregateId=${receiptId}`)
    const event = list.data.events[0] as Json

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const processed = await api('/api/outbox/process', {
        method: 'POST',
        json: { limit: 100 },
        headers: { 'x-outbox-worker-secret': 'test-outbox-secret' },
      })
      expect(processed.status).toBe(200)
    }

    const dead = await api(`/api/outbox/${event.id}`)
    expect(dead.data.event.status).toBe('dead_letter')
    expect(dead.data.event.attempts).toBe(2)
    expect(dead.data.attempts).toHaveLength(2)
    expect(dead.data.attempts.every((attempt: Json) => attempt.status === 'failed')).toBe(true)

    const retry = await api(`/api/outbox/${event.id}/retry`, { method: 'POST', json: {} })
    expect(retry.status).toBe(409)

    const replay = await api(`/api/outbox/${event.id}/replay`, { method: 'POST', json: {} })
    expect(replay.status).toBe(200)
    expect(replay.data.event).toMatchObject({ status: 'pending', attempts: 0, replayEpoch: 1 })

    telegramFail = false
    const processed = await api('/api/outbox/process', {
      method: 'POST',
      json: { limit: 100 },
      headers: { 'x-outbox-worker-secret': 'test-outbox-secret' },
    })
    expect(processed.status).toBe(200)

    const sent = await api(`/api/outbox/${event.id}`)
    expect(sent.data.event.status).toBe('sent')
    expect(sent.data.event.replayEpoch).toBe(1)
    expect(sent.data.attempts.map((attempt: Json) => `${attempt.epoch}:${attempt.attempt}:${attempt.status}`))
      .toEqual(['0:1:failed', '0:2:failed', '1:1:sent'])
  })

  it('protects the outbox journal and the worker endpoint', async () => {
    const anonymous = await fetch(url('/api/outbox'))
    expect(anonymous.status).toBe(401)

    const badWorker = await fetch(url('/api/outbox/process'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-outbox-worker-secret': 'wrong-secret' },
      body: JSON.stringify({ limit: 1 }),
    })
    expect([401, 403]).toContain(badWorker.status)
  })
})

describe('legacy import', () => {
  const snapshot = {
    clients: [{
      sourceId: 'e2e-client-1',
      displayName: 'Legacy E2E Rider',
      preferredChannel: 'phone',
      contacts: [{ channel: 'phone', value: '+84900000002', isPrimary: true }],
    }],
    motorcycles: [{
      sourceId: 'e2e-bike-1',
      assetCode: 'LEGACY-E2E-1',
      model: 'Honda Future',
      plate: '59-L1 902',
      status: 'rented',
      location: 'District 3',
    }],
    agreements: [{
      sourceId: 'e2e-agreement-1',
      clientSourceId: 'e2e-client-1',
      status: 'active',
      startDate: '2026-10-01T00:00:00+07:00',
      endDate: '2026-11-01T00:00:00+07:00',
    }],
    rentalItems: [{
      sourceId: 'e2e-item-1',
      agreementSourceId: 'e2e-agreement-1',
      motorcycleSourceId: 'e2e-bike-1',
      startDate: '2026-10-01T00:00:00+07:00',
      endDate: '2026-11-01T00:00:00+07:00',
      dailyRateMinor: 220_000,
      currency: 'VND',
      status: 'active',
    }],
    obligations: [{
      sourceId: 'e2e-obligation-1',
      clientSourceId: 'e2e-client-1',
      agreementSourceId: 'e2e-agreement-1',
      rentalItemSourceId: 'e2e-item-1',
      type: 'rent',
      amountMinor: 1_100_000,
      currency: 'VND',
      dueDate: '2026-10-15T00:00:00+07:00',
    }],
    receipts: [{
      sourceId: 'e2e-receipt-1',
      clientSourceId: 'e2e-client-1',
      amountMinor: 440_000,
      currency: 'VND',
      method: 'cash',
      receivedAt: '2026-10-05T00:00:00+07:00',
      allocations: [{ obligationSourceId: 'e2e-obligation-1', amountMinor: 440_000 }],
    }],
    deposits: [{
      sourceId: 'e2e-deposit-1',
      clientSourceId: 'e2e-client-1',
      agreementSourceId: 'e2e-agreement-1',
      type: 'cash',
      status: 'held',
      amountMinor: 2_200_000,
      currency: 'VND',
      receivedAt: '2026-10-01T00:00:00+07:00',
    }],
    documentCustodies: [{
      sourceId: 'e2e-doc-1',
      clientSourceId: 'e2e-client-1',
      documentType: 'passport',
      maskedNumber: 'C01X00***',
      status: 'held',
      receivedAt: '2026-10-01T00:00:00+07:00',
    }],
  }

  async function importedBike() {
    const list = await api('/api/bikes?search=LEGACY-E2E-1')
    return (list.data.bikes as Json[]).find(row => row.assetCode === 'LEGACY-E2E-1')
  }

  it('stages a dry run without writing target rows', async () => {
    const dryRun = await api('/api/imports/legacy', {
      json: { snapshot, apply: false, label: 'e2e dry run' },
    })
    expect(dryRun.status).toBe(200)
    expect(dryRun.data.status).toBe('dry_run')
    expect(dryRun.data.report.tables.motorcycles).toMatchObject({ total: 1, valid: 1, imported: 0 })
    expect(dryRun.data.report.importableTotals['obligations:VND']).toBe(1_100_000)
    expect(await importedBike()).toBeUndefined()

    const batches = await api('/api/imports/legacy')
    expect(batches.status).toBe(200)
    expect((batches.data.batches as Json[]).find(batch => batch.label === 'e2e dry run')).toMatchObject({ status: 'dry_run' })
  })

  it('reports duplicate source ids without failing the staging insert', async () => {
    const duplicate = {
      clients: [
        { sourceId: 'dup-client-1', displayName: 'First Duplicate', preferredChannel: 'phone', contacts: [] },
        { sourceId: 'dup-client-1', displayName: 'Second Duplicate', preferredChannel: 'phone', contacts: [] },
      ],
    }
    const result = await api('/api/imports/legacy', {
      json: { snapshot: duplicate, apply: false, label: 'e2e duplicate source id' },
    })
    expect(result.status).toBe(200)
    expect(result.data.report.tables.clients).toMatchObject({ total: 2, valid: 1, invalid: 1 })
    expect(result.data.report.issues.some((issue: Json) => issue.sourceId === 'dup-client-1' && issue.errors.some((error: string) => error.includes('duplicate')))).toBe(true)
  })

  it('rejects unknown top-level snapshot tables', async () => {
    const rejected = await api('/api/imports/legacy', {
      json: { snapshot: { bikes: [] }, apply: false },
    })
    expect(rejected.status).toBe(400)
  })

  it('rejects invalid references atomically', async () => {
    const invalid = {
      ...snapshot,
      obligations: [{ ...snapshot.obligations[0], clientSourceId: 'missing-client' }],
    }
    const rejected = await api('/api/imports/legacy', {
      json: { snapshot: invalid, apply: true, label: 'e2e invalid' },
    })
    expect(rejected.status).toBe(422)
    expect(rejected.data.data.batchId).toBeTruthy()
    expect(rejected.data.data.report.issues.some((issue: Json) => issue.sourceId === 'e2e-obligation-1')).toBe(true)
    expect(await importedBike()).toBeUndefined()
  })

  it('invalidates dependents even when the invalid parent is listed later', async () => {
    const dependent = {
      clients: [{ sourceId: 'dep-client-1', displayName: 'Dependent Rider', preferredChannel: 'phone', contacts: [] }],
      documentCustodies: [{
        sourceId: 'dep-doc-1',
        clientSourceId: 'dep-client-1',
        documentType: 'passport',
        status: 'returned',
        receivedAt: '2026-10-01T00:00:00+07:00',
      }],
      deposits: [{
        sourceId: 'dep-deposit-1',
        clientSourceId: 'dep-client-1',
        type: 'document_custody',
        status: 'held',
        documentCustodySourceId: 'dep-doc-1',
        receivedAt: '2026-10-01T00:00:00+07:00',
      }],
    }
    const rejected = await api('/api/imports/legacy', {
      json: { snapshot: dependent, apply: true, label: 'e2e dependent invalid' },
    })
    expect(rejected.status).toBe(422)
    const issue = rejected.data.data.report.issues.find((row: Json) => row.sourceId === 'dep-deposit-1')
    expect(issue?.errors.some((error: string) => error.includes('referenced row') && error.includes('dep-doc-1'))).toBe(true)
  })

  it('rejects aggregate allocations that exceed one obligation', async () => {
    const overAllocated = {
      ...snapshot,
      receipts: [
        { ...snapshot.receipts[0], sourceId: 'e2e-receipt-a', amountMinor: 600_000, allocations: [{ obligationSourceId: 'e2e-obligation-1', amountMinor: 600_000 }] },
        { ...snapshot.receipts[0], sourceId: 'e2e-receipt-b', amountMinor: 600_000, allocations: [{ obligationSourceId: 'e2e-obligation-1', amountMinor: 600_000 }] },
      ],
    }
    const rejected = await api('/api/imports/legacy', {
      json: { snapshot: overAllocated, apply: true, label: 'e2e overallocated' },
    })
    expect(rejected.status).toBe(422)
    expect(rejected.data.data.report.issues.some((issue: Json) => issue.errors.some((error: string) => error.includes('exceeds its amount')))).toBe(true)
    expect(await importedBike()).toBeUndefined()
  })

  it('rejects duplicate allocations to the same obligation', async () => {
    const duplicateAllocations = {
      ...snapshot,
      receipts: [{
        ...snapshot.receipts[0],
        sourceId: 'e2e-receipt-duplicate',
        amountMinor: 200_000,
        allocations: [
          { obligationSourceId: 'e2e-obligation-1', amountMinor: 100_000 },
          { obligationSourceId: 'e2e-obligation-1', amountMinor: 100_000 },
        ],
      }],
    }
    const rejected = await api('/api/imports/legacy', {
      json: { snapshot: duplicateAllocations, apply: true, label: 'e2e duplicate allocations' },
    })
    expect(rejected.status).toBe(422)
    expect(rejected.data.data.report.issues.some((issue: Json) => issue.errors.some((error: string) => error.includes('duplicate obligation')))).toBe(true)
    expect(await importedBike()).toBeUndefined()
  })

  it('refuses to add a new item to an existing agreement', async () => {
    const base = {
      clients: [{ sourceId: 'partial-client-1', displayName: 'Partial Replay Rider', preferredChannel: 'phone', contacts: [] }],
      agreements: [{ sourceId: 'partial-agreement-1', clientSourceId: 'partial-client-1', status: 'active' }],
    }
    const first = await api('/api/imports/legacy', {
      json: { snapshot: base, apply: true, label: 'e2e partial base' },
    })
    expect(first.status).toBe(200)

    const second = await api('/api/imports/legacy', {
      json: {
        snapshot: {
          ...base,
          motorcycles: [{
            sourceId: 'partial-bike-1',
            assetCode: 'PARTIAL-BIKE-1',
            model: 'Honda Blade',
            status: 'available',
          }],
          rentalItems: [{
            sourceId: 'partial-item-1',
            agreementSourceId: 'partial-agreement-1',
            motorcycleSourceId: 'partial-bike-1',
            startDate: '2026-10-01T00:00:00+07:00',
            endDate: '2026-10-10T00:00:00+07:00',
            dailyRateMinor: 150_000,
            status: 'planned',
          }],
        },
        apply: true,
        label: 'e2e partial conflict',
      },
    })
    expect(second.status).toBe(422)
    expect(second.data.data.report.issues.some((issue: Json) => issue.errors.some((error: string) => error.includes('cannot add a new rental item')))).toBe(true)
    const bikes = await api('/api/bikes?search=PARTIAL-BIKE-1')
    expect((bikes.data.bikes as Json[]).some(row => row.assetCode === 'PARTIAL-BIKE-1')).toBe(false)
  })

  it('applies a valid snapshot with provenance and generated QR credentials', async () => {
    const applied = await api('/api/imports/legacy', {
      json: { snapshot, apply: true, label: 'e2e apply' },
    })
    expect(applied.status).toBe(200)
    expect(applied.data.status).toBe('applied')
    expect(applied.data.report.tables.motorcycles).toMatchObject({ total: 1, imported: 1 })
    expect(applied.data.report.tables.receipts).toMatchObject({ total: 1, imported: 1 })

    const bike = await importedBike()
    expect(bike, 'the imported motorcycle must be visible').toBeTruthy()
    expect(bike!.status).toBe('rented')
    expect(bike!.manualCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/)
    expect(bike!.qrToken).toBeTruthy()

    const people = await api('/api/people?limit=50')
    const person = (people.data.clients as Json[]).find(row => row.displayName === 'Legacy E2E Rider')
    expect(person, 'the imported client must be visible').toBeTruthy()
    expect(person).toMatchObject({ contactCount: 1, openDocumentCount: 1, activeAgreementCount: 1 })

    const detail = await api(`/api/people/${person!.id}`)
    expect(detail.status).toBe(200)
    expect(detail.data.agreements[0]).toMatchObject({ status: 'active', version: 1, itemCount: 1 })
    const agreement = await api(`/api/agreements/${detail.data.agreements[0].id}`)
    expect(agreement.status).toBe(200)
    expect(agreement.data.items[0]).toMatchObject({ assetCode: 'LEGACY-E2E-1', status: 'active' })

    const payments = await api('/api/payments?month=2026-10')
    expect(payments.status).toBe(200)
    expect((payments.data.receipts as Json[]).some(row => row.amountMinor === 440_000)).toBe(true)

    const batches = await api('/api/imports/legacy')
    expect((batches.data.batches as Json[]).find(batch => batch.label === 'e2e apply')).toMatchObject({ status: 'applied', importedRowCount: 8 })
  })

  it('imports a closed cash deposit with its disposition history', async () => {
    const closedDeposit = {
      clients: [{ sourceId: 'closed-client-1', displayName: 'Closed Deposit Rider', preferredChannel: 'phone', contacts: [] }],
      deposits: [{
        sourceId: 'closed-deposit-1',
        clientSourceId: 'closed-client-1',
        type: 'cash',
        status: 'returned',
        amountMinor: 500_000,
        receivedAt: '2026-09-01T00:00:00+07:00',
        returnedAt: '2026-09-10T00:00:00+07:00',
        dispositions: [{ type: 'returned', amountMinor: 500_000 }],
      }],
    }
    const applied = await api('/api/imports/legacy', {
      json: { snapshot: closedDeposit, apply: true, label: 'e2e closed deposit' },
    })
    expect(applied.status).toBe(200)
    expect(applied.data.report.tables.deposits).toMatchObject({ total: 1, imported: 1 })
    expect(applied.data.report.sourceTotals['deposit_dispositions:VND']).toBe(500_000)

    const finance = await api('/api/finance')
    expect(finance.status).toBe(200)
    expect((finance.data.deposits as Json[]).find(row => row.clientName === 'Closed Deposit Rider')).toMatchObject({
      status: 'returned',
      amountMinor: 500_000,
    })
  })

  it('replays idempotently and reports every source row as duplicate', async () => {
    const replay = await api('/api/imports/legacy', {
      json: { snapshot, apply: true, label: 'e2e replay' },
    })
    expect(replay.status).toBe(200)
    expect(replay.data.status).toBe('applied')
    expect(replay.data.counts.total).toBe(8)
    expect(Object.values(replay.data.counts).filter((value: any) => value?.imported).every((value: any) => value.imported === 0)).toBe(true)
    expect((await importedBike())!.assetCode).toBe('LEGACY-E2E-1')
  })
})
