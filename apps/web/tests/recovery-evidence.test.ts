import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditEvents, closeDb, getDb, recoveryDrillScopes, recoveryDrills, users } from '@book-moto/db'
import { recordDrillEvidence } from '../server/utils/recovery-drill'
const HEX = `sha256:${'c'.repeat(64)}`

let operatorEmail: string

beforeAll(async () => {
  const db = await getDb()
  const [owner] = await db.select({ email: users.email })
    .from(users)
    .where(eq(users.role, 'owner'))
    .limit(1)
  if (!owner) throw new Error('Seeded owner is missing')
  operatorEmail = owner.email
})

afterAll(async () => {
  await closeDb()
})

function verification(status: 'passed' | 'failed') {
  return {
    status,
    failureCode: status === 'passed' ? null : 'scope_mismatch',
    scopes: [{
      scope: 'motorcycles',
      expectedCount: 10,
      actualCount: status === 'passed' ? 10 : 9,
      expectedTotalMinor: null,
      actualTotalMinor: null,
      currency: null,
      status,
      mismatchCode: status === 'passed' ? null : 'count_mismatch' as const,
    }],
  }
}

describe('drill evidence', () => {
  it('stores a terminal drill with scopes and an audit event', async () => {
    const evidence = await recordDrillEvidence({
      operatorEmail,
      startedAt: new Date('2026-10-28T09:00:00.000Z'),
      finishedAt: new Date('2026-10-28T09:42:00.000Z'),
      targetEnvironment: 'isolated',
      artifactRef: 'recovery/2026-10-28T09-00-00Z',
      manifestChecksum: HEX,
      verification: verification('passed'),
    })

    const db = await getDb()
    const [drill] = await db.select().from(recoveryDrills).where(eq(recoveryDrills.id, evidence.drillId))
    expect(drill?.status).toBe('passed')
    expect(drill?.failureCode).toBeNull()

    const scopes = await db.select().from(recoveryDrillScopes).where(eq(recoveryDrillScopes.drillId, evidence.drillId))
    expect(scopes).toHaveLength(1)
    expect(scopes[0]).toMatchObject({ scope: 'motorcycles', expectedCount: 10, actualCount: 10, status: 'passed' })

    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, evidence.drillId))
    expect(audit?.action).toBe('recovery.drill_completed')
    expect(JSON.stringify(audit?.metadata)).not.toMatch(/@|\+84|passport/i)
  })

  it('stores a failed drill with the failing scope and no success evidence', async () => {
    const evidence = await recordDrillEvidence({
      operatorEmail,
      startedAt: new Date('2026-10-28T10:00:00.000Z'),
      finishedAt: new Date('2026-10-28T10:05:00.000Z'),
      targetEnvironment: 'isolated',
      artifactRef: 'recovery/failed-artifact',
      manifestChecksum: HEX,
      verification: verification('failed'),
    })

    const db = await getDb()
    const [drill] = await db.select().from(recoveryDrills).where(eq(recoveryDrills.id, evidence.drillId))
    expect(drill?.status).toBe('failed')
    expect(drill?.failureCode).toBe('scope_mismatch')

    const scopes = await db.select().from(recoveryDrillScopes).where(eq(recoveryDrillScopes.drillId, evidence.drillId))
    expect(scopes[0]).toMatchObject({ status: 'failed', mismatchCode: 'count_mismatch' })
  })

  it('rejects updates and deletes of terminal evidence', async () => {
    const evidence = await recordDrillEvidence({
      operatorEmail,
      startedAt: new Date('2026-10-28T11:00:00.000Z'),
      finishedAt: new Date('2026-10-28T11:01:00.000Z'),
      targetEnvironment: 'isolated',
      artifactRef: 'recovery/immutable-artifact',
      manifestChecksum: HEX,
      verification: verification('passed'),
    })

    const db = await getDb()
    await expect(db.update(recoveryDrills)
      .set({ status: 'failed' })
      .where(eq(recoveryDrills.id, evidence.drillId))).rejects.toThrow()

    await expect(db.update(recoveryDrills)
      .set({ artifactRef: 'recovery/other' })
      .where(eq(recoveryDrills.id, evidence.drillId))).rejects.toThrow()

    await expect(db.delete(recoveryDrills)
      .where(eq(recoveryDrills.id, evidence.drillId))).rejects.toThrow()

    await expect(db.update(recoveryDrillScopes)
      .set({ actualCount: 999 })
      .where(eq(recoveryDrillScopes.drillId, evidence.drillId))).rejects.toThrow()

    await expect(db.delete(recoveryDrillScopes)
      .where(eq(recoveryDrillScopes.drillId, evidence.drillId))).rejects.toThrow()

    const [row] = await db.select({ count: count() })
      .from(recoveryDrills)
      .where(eq(recoveryDrills.id, evidence.drillId))
    expect(Number(row?.count)).toBe(1)
  })

  it('refuses evidence for a user without the owner or admin role', async () => {
    const db = await getDb()
    const email = `operator-${Date.now()}@moto.test`
    await db.insert(users).values({
      email,
      name: 'Plain Operator',
      passwordHash: 'not-a-real-hash',
      role: 'operator',
    })

    await expect(recordDrillEvidence({
      operatorEmail: email,
      startedAt: new Date('2026-10-28T12:00:00.000Z'),
      finishedAt: new Date('2026-10-28T12:01:00.000Z'),
      targetEnvironment: 'isolated',
      artifactRef: 'recovery/forbidden-artifact',
      manifestChecksum: HEX,
      verification: verification('passed'),
    })).rejects.toThrow(/owner/i)
  })
})
