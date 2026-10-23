export type OutboxMessageEvent = {
  eventType: string
  payload: Record<string, unknown>
}

const TELEGRAM_MAX_LENGTH = 3900

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function amount(payload: Record<string, unknown>): number | null {
  const value = payload.amountMinor
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function formatTelegramMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor == null) return '—'
  return `${amountMinor.toLocaleString('vi-VN')} ${currency || 'VND'}`
}

export function formatTelegramDate(value: unknown): string {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

/**
 * Builds the staff-channel text for one outbox event. Messages are plain text
 * (no parse mode) and never carry document numbers, phone numbers or emails.
 * Financial events explicitly say they are internal records, not payment proof.
 */
export function buildTelegramMessage(event: OutboxMessageEvent): string {
  const payload = event.payload || {}
  const client = text(payload, 'clientName')
  const assetCode = text(payload, 'assetCode')
  const model = text(payload, 'model')
  const lines: string[] = []

  switch (event.eventType) {
    case 'receipt.recorded':
      lines.push('MOTO//OPS · receipt recorded')
      lines.push(formatTelegramMoney(amount(payload), text(payload, 'currency')))
      lines.push(`Method: ${text(payload, 'method') || '—'}`)
      if (client) lines.push(`Client: ${client}`)
      if (payload.receivedAt) lines.push(`Received: ${formatTelegramDate(payload.receivedAt)}`)
      lines.push('Internal record — not a payment confirmation.')
      break
    case 'rental.handover_completed':
      lines.push('MOTO//OPS · bike handed over')
      lines.push(`${assetCode || '—'} · ${model || '—'}`)
      if (client) lines.push(`Client: ${client}`)
      if (payload.endDate) lines.push(`Return due: ${formatTelegramDate(payload.endDate)}`)
      lines.push('Internal operational record.')
      break
    case 'rental.return_completed':
      lines.push('MOTO//OPS · bike returned')
      lines.push(`${assetCode || '—'} · ${model || '—'}`)
      if (client) lines.push(`Client: ${client}`)
      if (amount(payload) != null && amount(payload)! > 0) {
        lines.push(`Damage charge: ${formatTelegramMoney(amount(payload), text(payload, 'currency'))}`)
      } else {
        lines.push('Damage charge: none')
      }
      lines.push('Internal operational record.')
      break
    case 'deposit.returned':
      lines.push('MOTO//OPS · deposit returned')
      if (text(payload, 'type') === 'document_custody') {
        lines.push('Document custody released')
      } else {
        lines.push(formatTelegramMoney(amount(payload), text(payload, 'currency')))
      }
      if (client) lines.push(`Client: ${client}`)
      lines.push('Internal record — not a payment confirmation.')
      break
    default:
      lines.push(`MOTO//OPS · ${event.eventType}`)
      lines.push('Internal event recorded.')
  }

  return lines.join('\n').slice(0, TELEGRAM_MAX_LENGTH)
}
