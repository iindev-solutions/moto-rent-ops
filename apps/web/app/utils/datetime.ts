export function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatMonthLabel(month: string, locale: string = 'en'): string {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  if (!year || !monthNumber) return month
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function calendarDaysUntil(value: string | Date | null | undefined): number | null {
  if (!value) return null
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return null
  const startOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  return Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000)
}
