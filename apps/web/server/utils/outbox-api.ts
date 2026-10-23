import type { User } from '#auth-utils'
import type { outboxAttempts, outboxEvents } from '@book-moto/db'

export const OUTBOX_STATUSES = ['pending', 'processing', 'sent', 'dead_letter'] as const
export type OutboxStatus = typeof OUTBOX_STATUSES[number]

export function requireOutboxAdmin(user: User) {
  if (!['owner', 'admin'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner access required' })
  }
}

export function serializeOutboxEvent(row: typeof outboxEvents.$inferSelect) {
  return {
    id: row.id,
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    dedupeKey: row.dedupeKey,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    replayEpoch: row.replayEpoch,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lastError: row.lastError,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function serializeOutboxAttempt(row: typeof outboxAttempts.$inferSelect) {
  return {
    id: row.id,
    epoch: row.epoch,
    attempt: row.attempt,
    status: row.status,
    httpStatus: row.httpStatus,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}
