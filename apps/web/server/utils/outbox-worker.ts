import { and, asc, eq, lt, lte, or } from 'drizzle-orm'
import { buildTelegramMessage } from '@book-moto/domain'
import { getDb, outboxAttempts, outboxEvents } from '@book-moto/db'

type OutboxEventRow = typeof outboxEvents.$inferSelect

export type OutboxProcessResult = {
  configured: boolean
  claimed: number
  sent: number
  failed: number
  deadLettered: number
  errors: Array<{ id: string, error: string }>
}

export class OutboxDeliveryError extends Error {
  readonly httpStatus: number | null

  constructor(message: string, httpStatus: number | null) {
    super(message)
    this.name = 'OutboxDeliveryError'
    this.httpStatus = httpStatus
  }
}

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim())
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function retryBaseMs(): number {
  const parsed = Number(process.env.OUTBOX_RETRY_BASE_MS)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60_000
}

function maxAttempts(): number {
  return positiveInt(process.env.OUTBOX_MAX_ATTEMPTS, 5)
}

function truncate(value: string, length = 2000): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

export async function sendTelegramMessage(text: string): Promise<{ httpStatus: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  const baseUrl = (process.env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org').replace(/\/$/, '')
  if (!token || !chatId) {
    throw new OutboxDeliveryError('Telegram is not configured', null)
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new OutboxDeliveryError(error instanceof Error ? error.message : 'Telegram request failed', null)
  }

  let body: { ok?: boolean, description?: string } | null = null
  try {
    body = await response.json() as { ok?: boolean, description?: string }
  } catch {
    body = null
  }

  if (!response.ok || body?.ok !== true) {
    const description = typeof body?.description === 'string' && body.description.trim()
      ? body.description.trim()
      : `Telegram returned HTTP ${response.status}`
    throw new OutboxDeliveryError(truncate(description, 1000), response.status)
  }

  return { httpStatus: response.status }
}

async function claimDueEvents(limit: number, now: Date): Promise<Array<{ row: OutboxEventRow, attempt: number }>> {
  const db = await getDb()
  const staleBefore = new Date(now.getTime() - 5 * 60_000)

  return db.transaction(async (tx) => {
    const rows = await tx.select()
      .from(outboxEvents)
      .where(and(
        lte(outboxEvents.nextAttemptAt, now),
        or(
          eq(outboxEvents.status, 'pending'),
          and(eq(outboxEvents.status, 'processing'), lt(outboxEvents.lockedAt, staleBefore)),
        ),
      ))
      .orderBy(asc(outboxEvents.nextAttemptAt), asc(outboxEvents.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true })

    const claimed: Array<{ row: OutboxEventRow, attempt: number }> = []
    for (const row of rows) {
      const attempt = row.attempts + 1
      await tx.update(outboxEvents).set({
        status: 'processing',
        attempts: attempt,
        lockedAt: now,
        updatedAt: now,
      }).where(eq(outboxEvents.id, row.id))
      claimed.push({ row: { ...row, attempts: attempt, status: 'processing' }, attempt })
    }
    return claimed
  })
}

async function markSent(row: OutboxEventRow, attempt: number, startedAt: Date, httpStatus: number): Promise<void> {
  const db = await getDb()
  const finishedAt = new Date()
  await db.transaction(async (tx) => {
    await tx.update(outboxEvents).set({
      status: 'sent',
      sentAt: finishedAt,
      lockedAt: null,
      lastError: null,
      updatedAt: finishedAt,
    }).where(and(
      eq(outboxEvents.id, row.id),
      eq(outboxEvents.status, 'processing'),
      eq(outboxEvents.attempts, attempt),
    ))

    await tx.insert(outboxAttempts).values({
      eventId: row.id,
      epoch: row.replayEpoch,
      attempt,
      status: 'sent',
      httpStatus,
      startedAt,
      finishedAt,
    }).onConflictDoNothing()
  })
}

async function markFailed(row: OutboxEventRow, attempt: number, startedAt: Date, error: OutboxDeliveryError): Promise<boolean> {
  const db = await getDb()
  const finishedAt = new Date()
  const deadLettered = attempt >= maxAttempts()
  const delay = deadLettered ? 0 : Math.min(retryBaseMs() * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60_000)
  const nextAttemptAt = new Date(finishedAt.getTime() + delay)
  const message = truncate(error.message)

  await db.transaction(async (tx) => {
    await tx.update(outboxEvents).set({
      status: deadLettered ? 'dead_letter' : 'pending',
      nextAttemptAt,
      lockedAt: null,
      lastError: message,
      updatedAt: finishedAt,
    }).where(and(
      eq(outboxEvents.id, row.id),
      eq(outboxEvents.status, 'processing'),
      eq(outboxEvents.attempts, attempt),
    ))

    await tx.insert(outboxAttempts).values({
      eventId: row.id,
      epoch: row.replayEpoch,
      attempt,
      status: 'failed',
      httpStatus: error.httpStatus,
      error: message,
      startedAt,
      finishedAt,
    }).onConflictDoNothing()
  })

  return deadLettered
}

/**
 * Claims a small batch of due events, sends each one to Telegram and records
 * every attempt. A network call is never made inside a database transaction.
 * Delivery is at-least-once: a crash after Telegram accepted a message but
 * before `sent` was committed can cause a duplicate on the next run.
 */
export async function processOutboxBatch(options: { limit?: number, now?: Date } = {}): Promise<OutboxProcessResult> {
  if (!telegramConfigured()) {
    return { configured: false, claimed: 0, sent: 0, failed: 0, deadLettered: 0, errors: [] }
  }

  const now = options.now ?? new Date()
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const claimed = await claimDueEvents(limit, now)
  const result: OutboxProcessResult = {
    configured: true,
    claimed: claimed.length,
    sent: 0,
    failed: 0,
    deadLettered: 0,
    errors: [],
  }

  for (const { row, attempt } of claimed) {
    const startedAt = new Date()
    try {
      const message = buildTelegramMessage({ eventType: row.eventType, payload: row.payload })
      const { httpStatus } = await sendTelegramMessage(message)
      await markSent(row, attempt, startedAt, httpStatus)
      result.sent += 1
    } catch (error) {
      const deliveryError = error instanceof OutboxDeliveryError
        ? error
        : new OutboxDeliveryError(error instanceof Error ? error.message : 'Telegram delivery failed', null)
      const deadLettered = await markFailed(row, attempt, startedAt, deliveryError)
      result.failed += 1
      if (deadLettered) result.deadLettered += 1
      result.errors.push({ id: row.id, error: deliveryError.message })
    }
  }

  return result
}
