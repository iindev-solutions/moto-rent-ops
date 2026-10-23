import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const { processOutboxBatch, telegramConfigured } = await import('../server/utils/outbox-worker')

const intervalMs = Math.max(1000, Number(process.env.OUTBOX_WORKER_INTERVAL_MS) || 15_000)
const batchSize = Math.min(Math.max(Number(process.env.OUTBOX_WORKER_BATCH_SIZE) || 20, 1), 100)
let stopping = false

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

if (!telegramConfigured()) {
  console.warn('[outbox] Telegram is not configured; events stay pending. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.')
}

while (!stopping) {
  try {
    const result = await processOutboxBatch({ limit: batchSize })
    if (result.claimed > 0) console.log(`[outbox] ${JSON.stringify(result)}`)
  } catch (error) {
    console.error('[outbox] batch failed:', error instanceof Error ? error.message : error)
  }
  await new Promise(resolve => setTimeout(resolve, intervalMs))
}
