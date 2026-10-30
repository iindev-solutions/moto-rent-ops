import type { DbTransaction } from '@book-moto/db'
import { outboxEvents } from '@book-moto/db'

export type OutboxEventInput = {
  eventType: string
  aggregateType: string
  aggregateId?: string | null
  dedupeKey: string
  payload?: Record<string, unknown>
}

/**
 * Adds an event to the transactional outbox. Must be called inside the same
 * transaction as the business change, so an event exists if and only if the
 * change committed. Duplicate dedupe keys are ignored.
 */
export async function enqueueOutbox(tx: DbTransaction, input: OutboxEventInput): Promise<void> {
  await tx.insert(outboxEvents).values({
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId ?? null,
    dedupeKey: input.dedupeKey,
    payload: input.payload ?? {},
  }).onConflictDoNothing({ target: outboxEvents.dedupeKey })
}
