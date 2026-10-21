import { setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({ dev: true })

type Json = Record<string, any>

let cookie = ''
let firstRental: Json = {}

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

  it('logs the seeded owner in', async () => {
    await login()
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
