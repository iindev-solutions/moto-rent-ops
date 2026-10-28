import { describe, expect, it } from 'vitest'
import { evaluateRecoveryReadiness } from '../server/utils/recovery-status'

const now = new Date('2026-10-28T12:00:00.000Z')
const rpoHours = 24

type Snapshot = {
  id: string
  status: 'running' | 'passed' | 'failed'
  startedAt: Date
  finishedAt: Date | null
}

function drill(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    status: 'passed',
    startedAt: new Date('2026-10-28T11:00:00.000Z'),
    finishedAt: new Date('2026-10-28T11:30:00.000Z'),
    ...overrides,
  }
}

describe('recovery readiness', () => {
  it('is not ready when no drill has ever run', () => {
    const status = evaluateRecoveryReadiness({ lastDrill: null, now, rpoHours })
    expect(status).toMatchObject({
      ready: false,
      reason: 'no_drill',
      lastDrillId: null,
      openGapCount: 1,
    })
  })

  it('is not ready while the only drill is still running', () => {
    const status = evaluateRecoveryReadiness({
      lastDrill: drill({ status: 'running', finishedAt: null }),
      now,
      rpoHours,
    })
    expect(status.ready).toBe(false)
    expect(status.reason).toBe('verification_incomplete')
  })

  it('is not ready when the last terminal drill failed', () => {
    const status = evaluateRecoveryReadiness({
      lastDrill: drill({ status: 'failed' }),
      now,
      rpoHours,
    })
    expect(status.ready).toBe(false)
    expect(status.reason).toBe('last_drill_failed')
    expect(status.lastDrillId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('is ready for a recent passed drill', () => {
    const status = evaluateRecoveryReadiness({ lastDrill: drill(), now, rpoHours })
    expect(status).toMatchObject({
      ready: true,
      reason: null,
      lastDrillAt: '2026-10-28T11:30:00.000Z',
      lastBackupAt: '2026-10-28T11:00:00.000Z',
      backupAgeSeconds: 3600,
      openGapCount: 0,
    })
  })

  it('is not ready when the latest backup is older than the recovery point target', () => {
    const status = evaluateRecoveryReadiness({
      lastDrill: drill({ startedAt: new Date('2026-10-27T10:00:00.000Z') }),
      now,
      rpoHours,
    })
    expect(status.ready).toBe(false)
    expect(status.reason).toBe('backup_stale')
    expect(status.backupAgeSeconds).toBe(93_600)
  })

  it('treats the recovery point boundary as still fresh', () => {
    const status = evaluateRecoveryReadiness({
      lastDrill: drill({ startedAt: new Date('2026-10-27T12:00:00.000Z') }),
      now,
      rpoHours,
    })
    expect(status.ready).toBe(true)
    expect(status.backupAgeSeconds).toBe(86_400)
  })
})
