import { desc } from 'drizzle-orm'
import { recoveryDrills, type AppDatabase } from '@book-moto/db'

export type RecoveryStatusReason =
  | 'no_drill'
  | 'verification_incomplete'
  | 'last_drill_failed'
  | 'backup_stale'

export interface RecoveryDrillSnapshot {
  id: string
  status: 'running' | 'passed' | 'failed'
  startedAt: Date
  finishedAt: Date | null
}

export interface RecoveryStatus {
  ready: boolean
  reason: RecoveryStatusReason | null
  lastDrillId: string | null
  lastDrillAt: string | null
  lastBackupAt: string | null
  backupAgeSeconds: number | null
  openGapCount: number
}

export const DEFAULT_RECOVERY_RPO_HOURS = 24

function configuredRpoHours() {
  const value = Number(process.env.RECOVERY_RPO_HOURS)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RECOVERY_RPO_HOURS
}

/**
 * Readiness is a pure projection so the reasons can be tested without a
 * database. `lastBackupAt` is the start of the last drill, which is when the
 * backup snapshot was taken.
 */
export function evaluateRecoveryReadiness(input: {
  lastDrill: RecoveryDrillSnapshot | null
  now: Date
  rpoHours: number
}): RecoveryStatus {
  const gap: RecoveryStatus = {
    ready: false,
    reason: 'no_drill',
    lastDrillId: null,
    lastDrillAt: null,
    lastBackupAt: null,
    backupAgeSeconds: null,
    openGapCount: 1,
  }

  const drill = input.lastDrill
  if (!drill) return gap

  const lastBackupAt = drill.startedAt.toISOString()
  const backupAgeSeconds = Math.max(0, Math.floor((input.now.getTime() - drill.startedAt.getTime()) / 1000))
  const lastDrillAt = drill.finishedAt ? drill.finishedAt.toISOString() : null

  if (drill.status === 'running') {
    return {
      ...gap,
      reason: 'verification_incomplete',
      lastDrillId: drill.id,
      lastBackupAt,
      backupAgeSeconds,
    }
  }

  if (drill.status === 'failed') {
    return {
      ...gap,
      reason: 'last_drill_failed',
      lastDrillId: drill.id,
      lastDrillAt,
      lastBackupAt,
      backupAgeSeconds,
    }
  }

  if (backupAgeSeconds > input.rpoHours * 3600) {
    return {
      ...gap,
      reason: 'backup_stale',
      lastDrillId: drill.id,
      lastDrillAt,
      lastBackupAt,
      backupAgeSeconds,
    }
  }

  return {
    ready: true,
    reason: null,
    lastDrillId: drill.id,
    lastDrillAt,
    lastBackupAt,
    backupAgeSeconds,
    openGapCount: 0,
  }
}

export async function getRecoveryStatus(db: AppDatabase, now = new Date()): Promise<RecoveryStatus> {
  const [lastDrill] = await db.select({
    id: recoveryDrills.id,
    status: recoveryDrills.status,
    startedAt: recoveryDrills.startedAt,
    finishedAt: recoveryDrills.finishedAt,
  })
    .from(recoveryDrills)
    .orderBy(desc(recoveryDrills.startedAt))
    .limit(1)

  return evaluateRecoveryReadiness({
    lastDrill: lastDrill
      ? {
          id: lastDrill.id,
          status: lastDrill.status as RecoveryDrillSnapshot['status'],
          startedAt: lastDrill.startedAt,
          finishedAt: lastDrill.finishedAt,
        }
      : null,
    now,
    rpoHours: configuredRpoHours(),
  })
}
