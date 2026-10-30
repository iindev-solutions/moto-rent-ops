import { timingSafeEqual } from 'node:crypto'
import { processOutboxBatch } from '../../utils/outbox-worker'

function workerAuthorized(event: Parameters<typeof getHeader>[0]): boolean {
  const expected = process.env.OUTBOX_WORKER_SECRET?.trim()
  const provided = getHeader(event, 'x-outbox-worker-secret')?.trim()
  if (!expected || !provided || expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const body = await readBody(event).catch(() => null)
  let limit = 20
  if (body && typeof body === 'object' && 'limit' in body) {
    const requested = Number((body as { limit?: unknown }).limit)
    if (Number.isFinite(requested)) limit = Math.min(Math.max(Math.floor(requested), 1), 100)
  }

  if (!workerAuthorized(event)) {
    const user = await requireAppUser(event)
    requireOutboxAdmin(user)
  }

  try {
    return await processOutboxBatch({ limit })
  } catch (error) {
    throwApiError(error)
  }
})
