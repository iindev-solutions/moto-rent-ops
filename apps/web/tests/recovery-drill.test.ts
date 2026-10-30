import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { count as countRows, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachments, closeDb, getDb, outboxEvents, recoveryDrills, users } from '@book-moto/db'
import { runRecoveryDrill, verifyRecoveryBackup, type DrillResult } from '../server/utils/recovery-drill'

let workspace: string
let sourceStorageRoot: string
let targetStorageRoot: string
let targetPgliteDir: string
let artifactDir: string
let operatorEmail: string
let attachmentKey: string
let attachmentBody: string
let result: DrillResult
let outboxCountBefore: number

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'recovery-drill-'))
  sourceStorageRoot = join(workspace, 'source-documents')
  targetStorageRoot = join(workspace, 'target-documents')
  targetPgliteDir = join(workspace, 'target-pglite')
  artifactDir = join(workspace, 'artifact')

  attachmentKey = `attachments/${randomUUID()}/${randomUUID()}.txt`
  attachmentBody = 'recovery fixture document'
  const attachmentPath = join(sourceStorageRoot, attachmentKey)
  await mkdir(join(attachmentPath, '..'), { recursive: true })
  await writeFile(attachmentPath, attachmentBody)

  const db = await getDb()
  await db.insert(attachments).values({
    entityType: 'document_custody',
    entityId: randomUUID(),
    storageKey: attachmentKey,
    contentType: 'text/plain',
    sizeBytes: Buffer.byteLength(attachmentBody),
  })

  const [owner] = await db.select({ email: users.email })
    .from(users)
    .where(eq(users.role, 'owner'))
    .limit(1)
  if (!owner) throw new Error('Seeded owner is missing')
  operatorEmail = owner.email

  const [outboxBefore] = await db.select({ count: countRows() }).from(outboxEvents)
  outboxCountBefore = Number(outboxBefore?.count ?? 0)

  result = await runRecoveryDrill({
    targetDir: artifactDir,
    recoveryRoot: workspace,
    operatorEmail,
    targetEnvironment: 'isolated',
    targetPgliteDir,
    targetStorageRoot,
    sourceStorageRoot,
  })
})

afterAll(async () => {
  await closeDb()
  await rm(workspace, { recursive: true, force: true })
})

describe('PGlite recovery drill', () => {
  it('passes every scope and records the drill', async () => {
    expect(result.status).toBe('passed')
    expect(result.failureCode).toBeNull()
    expect(result.scopes.length).toBeGreaterThan(0)
    expect(result.scopes.every(scope => scope.status === 'passed')).toBe(true)
    expect(result.scopes.some(scope => scope.scope === 'motorcycles')).toBe(true)
    expect(result.scopes.some(scope => scope.scope === 'financial:VND')).toBe(true)
    expect(result.manifestChecksum).toMatch(/^sha256:[0-9a-f]{64}$/)

    const db = await getDb()
    const [drill] = await db.select().from(recoveryDrills).where(eq(recoveryDrills.id, result.drillId))
    expect(drill).toMatchObject({
      status: 'passed',
      targetEnvironment: 'isolated',
      artifactRef: result.artifactRef,
      manifestChecksum: result.manifestChecksum,
    })
    expect(drill?.finishedAt).toBeInstanceOf(Date)
  })

  it('restores stored documents into the isolated target', async () => {
    const restored = await readFile(join(targetStorageRoot, attachmentKey), 'utf8')
    expect(restored).toBe(attachmentBody)
  })

  it('leaves the source database readable after the drill', async () => {
    const db = await getDb()
    const [row] = await db.select({ count: countRows() }).from(users).limit(1)
    expect(Number(row?.count)).toBeGreaterThan(0)
  })

  it('creates no outbound events during the drill', async () => {
    const db = await getDb()
    const [row] = await db.select({ count: countRows() }).from(outboxEvents)
    expect(Number(row?.count)).toBe(outboxCountBefore)
  })

  it('re-verifies a restored target without recording evidence', async () => {
    const db = await getDb()
    const [before] = await db.select({ count: countRows() }).from(recoveryDrills)

    const verified = await verifyRecoveryBackup({
      artifactDir,
      recoveryRoot: workspace,
      targetEnvironment: 'isolated',
      targetPgliteDir,
      targetStorageRoot,
    })

    expect(verified.verification.status).toBe('passed')
    expect(verified.verification.failureCode).toBeNull()
    expect(verified.manifestChecksum).toBe(result.manifestChecksum)
    expect(verified.verification.scopes.every(scope => scope.status === 'passed')).toBe(true)

    const [after] = await db.select({ count: countRows() }).from(recoveryDrills)
    expect(Number(after?.count)).toBe(Number(before?.count))
  })

  it('refuses a missing PGlite target instead of creating it', async () => {
    const missingTarget = join(workspace, 'missing-target')

    await expect(verifyRecoveryBackup({
      artifactDir,
      recoveryRoot: workspace,
      targetEnvironment: 'isolated',
      targetPgliteDir: missingTarget,
      targetStorageRoot,
    })).rejects.toMatchObject({ code: 'configuration_error' })

    await expect(stat(missingTarget)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
