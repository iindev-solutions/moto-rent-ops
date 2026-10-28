import { setup, url } from '@nuxt/test-utils/e2e'
import { hash } from 'argon2'
import { describe, expect, it } from 'vitest'
import { closeDb, getDb, users } from '@book-moto/db'
import { beginRecoveryDrill, recordDrillEvidence } from '../../server/utils/recovery-drill'

type Json = Record<string, any>

const ownerEmail = process.env.SEED_ADMIN_EMAIL
const ownerPassword = process.env.SEED_ADMIN_PASSWORD
if (!ownerEmail || !ownerPassword) {
  throw new Error('E2E recovery tests require SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD')
}

const operatorEmail = 'recovery-operator@moto.test'
const operatorPassword = 'recovery-operator-password-2026'

const passedStartedAt = new Date()
const failedStartedAt = new Date(passedStartedAt.getTime() - 3 * 60 * 60 * 1000)
const runningStartedAt = new Date(passedStartedAt.getTime() - 2 * 60 * 60 * 1000)

// Fixtures are written before the Nuxt server starts. PGlite allows a single
// in-process attachment, so the test connection must be closed first.
const db = await getDb()
try {
  const passwordHash = await hash(operatorPassword)
  await db.insert(users).values({
    email: operatorEmail,
    name: 'Recovery Operator',
    passwordHash,
    role: 'operator',
  }).onConflictDoUpdate({
    target: users.email,
    set: { name: 'Recovery Operator', passwordHash, role: 'operator', active: true },
  })
} finally {
  await closeDb()
}

const passed = await recordDrillEvidence({
  operatorEmail: ownerEmail,
  startedAt: passedStartedAt,
  finishedAt: new Date(passedStartedAt.getTime() + 30 * 60 * 1000),
  targetEnvironment: 'isolated',
  artifactRef: 'recovery/e2e-passed',
  manifestChecksum: `sha256:${'d'.repeat(64)}`,
  verification: {
    status: 'passed',
    failureCode: null,
    scopes: [
      {
        scope: 'motorcycles',
        expectedCount: 10,
        actualCount: 10,
        expectedTotalMinor: null,
        actualTotalMinor: null,
        currency: null,
        status: 'passed',
        mismatchCode: null,
      },
      {
        scope: 'financial:VND',
        expectedCount: 11,
        actualCount: 11,
        expectedTotalMinor: 18_370_000,
        actualTotalMinor: 18_370_000,
        currency: 'VND',
        status: 'passed',
        mismatchCode: null,
      },
    ],
  },
})

const failed = await recordDrillEvidence({
  operatorEmail: ownerEmail,
  startedAt: failedStartedAt,
  finishedAt: new Date(failedStartedAt.getTime() + 10 * 60 * 1000),
  targetEnvironment: 'isolated',
  artifactRef: 'recovery/e2e-failed',
  manifestChecksum: `sha256:${'e'.repeat(64)}`,
  verification: {
    status: 'failed',
    failureCode: 'scope_mismatch',
    scopes: [{
      scope: 'motorcycles',
      expectedCount: 10,
      actualCount: 9,
      expectedTotalMinor: null,
      actualTotalMinor: null,
      currency: null,
      status: 'failed',
      mismatchCode: 'count_mismatch',
    }],
  },
})

const runningDrillId = await beginRecoveryDrill({
  operatorEmail: ownerEmail,
  startedAt: runningStartedAt,
  targetEnvironment: 'isolated',
  artifactRef: 'recovery/e2e-running',
})

// Hand the data directory to the Nuxt dev server.
await closeDb()

await setup({ dev: true })

let ownerCookie = ''
let operatorCookie = ''

interface ApiResult {
  status: number
  data: Json
  headers: Headers
}

async function api(path: string, options: { cookie?: string } = {}): Promise<ApiResult> {
  const response = await fetch(url(path), {
    headers: options.cookie ? { cookie: options.cookie } : {},
  })
  const text = await response.text()
  let data: Json = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  return { status: response.status, data, headers: response.headers }
}

async function login(email: string, password: string) {
  const response = await fetch(url('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status).toBe(200)
  const sessionCookie = response.headers.getSetCookie().find(value => value.startsWith('nuxt-session='))
  expect(sessionCookie, 'login must set the nuxt-session cookie').toBeTruthy()
  return sessionCookie!.split(';')[0]!
}

describe('recovery API', () => {
  it('requires an authenticated owner or admin session', async () => {
    expect((await api('/api/recovery/status')).status).toBe(401)
    expect((await api('/api/recovery/drills')).status).toBe(401)
    expect((await api(`/api/recovery/drills/${passed.drillId}`)).status).toBe(401)
  })

  it('reports readiness without PII', async () => {
    ownerCookie = await login(ownerEmail, ownerPassword)
    const { status, data, headers } = await api('/api/recovery/status', { cookie: ownerCookie })
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(data).toMatchObject({
      ready: true,
      reason: null,
      lastDrillId: passed.drillId,
      openGapCount: 0,
    })
    expect(JSON.stringify(data)).not.toMatch(/@|\+84|passport/i)
  })

  it('forbids an operator session', async () => {
    operatorCookie = await login(operatorEmail, operatorPassword)
    expect((await api('/api/recovery/status', { cookie: operatorCookie })).status).toBe(403)
    expect((await api('/api/recovery/drills', { cookie: operatorCookie })).status).toBe(403)
    expect((await api(`/api/recovery/drills/${passed.drillId}`, { cookie: operatorCookie })).status).toBe(403)
  })

  it('lists terminal drills newest first and excludes running drills', async () => {
    const first = await api('/api/recovery/drills?limit=1', { cookie: ownerCookie })
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('no-store')
    expect(first.data.drills).toHaveLength(1)
    expect(first.data.drills[0]).toMatchObject({
      id: passed.drillId,
      status: 'passed',
      operatorName: 'System Owner',
      targetEnvironment: 'isolated',
      artifactRef: 'recovery/e2e-passed',
    })
    expect(first.data.nextCursor).toBe(passed.drillId)

    const second = await api(`/api/recovery/drills?limit=1&cursor=${passed.drillId}`, { cookie: ownerCookie })
    expect(second.status).toBe(200)
    expect(second.data.drills[0]).toMatchObject({ id: failed.drillId, status: 'failed', failureCode: 'scope_mismatch' })

    const all = await api('/api/recovery/drills?limit=100', { cookie: ownerCookie })
    expect(all.status).toBe(200)
    const ids = (all.data.drills as Json[]).map(row => row.id)
    expect(ids).toContain(passed.drillId)
    expect(ids).toContain(failed.drillId)
    expect(ids).not.toContain(runningDrillId)
    expect(JSON.stringify(all.data)).not.toMatch(/@|\+84|passport/i)
  })

  it('returns drill detail with allowlisted scope fields', async () => {
    const { status, data, headers } = await api(`/api/recovery/drills/${passed.drillId}`, { cookie: ownerCookie })
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(data).toMatchObject({
      id: passed.drillId,
      status: 'passed',
      operatorName: 'System Owner',
      manifestChecksum: `sha256:${'d'.repeat(64)}`,
      scopes: [
        {
          scope: 'financial:VND',
          expectedCount: 11,
          actualCount: 11,
          expectedTotalMinor: 18_370_000,
          actualTotalMinor: 18_370_000,
          currency: 'VND',
          status: 'passed',
          mismatchCode: null,
        },
        {
          scope: 'motorcycles',
          expectedCount: 10,
          actualCount: 10,
          expectedTotalMinor: null,
          actualTotalMinor: null,
          currency: null,
          status: 'passed',
          mismatchCode: null,
        },
      ],
    })
    expect(JSON.stringify(data)).not.toMatch(/@|\+84|passport|recovery-operator/i)
  })

  it('returns 404 for an unknown or malformed drill id', async () => {
    expect((await api('/api/recovery/drills/00000000-0000-4000-8000-000000000000', { cookie: ownerCookie })).status).toBe(404)
    expect((await api('/api/recovery/drills/not-a-uuid', { cookie: ownerCookie })).status).toBe(404)
  })
})
