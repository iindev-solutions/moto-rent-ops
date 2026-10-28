const tones: Record<string, string> = {
  available: 'is-success',
  rented: 'is-accent',
  reserved: 'is-accent',
  inspection: 'is-warning',
  maintenance: 'is-warning',
  blocked: 'is-danger',
  retired: 'is-danger',
  settled: 'is-success',
  partial: 'is-warning',
  partially_allocated: 'is-warning',
  planned: 'is-accent',
  overdue: 'is-danger',
  returned: 'is-success',
  closed: 'is-success',
  expired: 'is-danger',
  expiring_soon: 'is-warning',
  valid: 'is-success',
  held: 'is-warning',
  passed: 'is-success',
  failed: 'is-danger',
  running: 'is-accent',
}

export function statusTone(status: string | null | undefined): string {
  return status ? tones[status] || '' : ''
}
