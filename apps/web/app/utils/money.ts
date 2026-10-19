export function formatMoney(minor: number | null | undefined, currency = 'VND') {
  if (minor == null) return '—'
  return `${minor.toLocaleString('vi-VN')} ${currency}`
}
