import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import type { ScopeComparison, ScopeStats, VerificationResult } from './types'

/**
 * Record groups that participate in recovery verification. Order is stable so
 * manifests and reports are deterministic. Recovery evidence tables are not
 * included because evidence is written after the backup.
 */
export const RECORD_SCOPES = [
  'users',
  'motorcycles',
  'qr_identities',
  'qr_payloads',
  'location_assignments',
  'audit_events',
  'clients',
  'client_contacts',
  'document_custodies',
  'rental_agreements',
  'rental_items',
  'rental_agreement_versions',
  'handovers',
  'obligations',
  'receipts',
  'allocations',
  'deposits',
  'idempotency_records',
  'return_inspections',
  'deposit_dispositions',
  'incidents',
  'attachments',
  'maintenance_orders',
  'outbox_events',
  'outbox_attempts',
  'legacy_import_batches',
  'legacy_import_rows',
] as const

const FINANCIAL_QUERIES = [
  `select currency, count(*)::int as count, coalesce(sum(amount_minor), 0)::bigint as total
     from obligations group by currency`,
  `select currency, count(*)::int as count, coalesce(sum(amount_minor), 0)::bigint as total
     from receipts group by currency`,
  `select r.currency, count(*)::int as count, coalesce(sum(a.amount_minor), 0)::bigint as total
     from allocations a join receipts r on r.id = a.receipt_id group by r.currency`,
  `select currency, count(*)::int as count, coalesce(sum(amount_minor), 0)::bigint as total
     from deposits group by currency`,
  `select d.currency, count(*)::int as count, coalesce(sum(dd.amount_minor), 0)::bigint as total
     from deposit_dispositions dd join deposits d on d.id = dd.deposit_id group by d.currency`,
] as const

type Row = Record<string, unknown>

function rowsOf(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[]
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Row[] }).rows
  }
  return []
}

function toInteger(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return 0
}

/**
 * Counts every record group and sums every financial fact per currency.
 * Runs against any Drizzle database, so the same code verifies the source and
 * the restored target.
 */
export async function collectScopeStats(db: AppDatabase): Promise<ScopeStats[]> {
  const scopes: ScopeStats[] = []

  for (const name of RECORD_SCOPES) {
    const result = await db.execute(sql`select count(*)::int as count from ${sql.identifier(name)}`)
    const [row] = rowsOf(result)
    scopes.push({ name, count: toInteger(row?.count), totalMinor: null, currency: null })
  }

  const byCurrency = new Map<string, { count: number, totalMinor: number }>()
  for (const query of FINANCIAL_QUERIES) {
    const result = await db.execute(sql.raw(query))
    for (const row of rowsOf(result)) {
      const currency = String(row.currency ?? '')
      if (!/^[A-Z]{3}$/.test(currency)) continue
      const current = byCurrency.get(currency) ?? { count: 0, totalMinor: 0 }
      current.count += toInteger(row.count)
      current.totalMinor += toInteger(row.total)
      byCurrency.set(currency, current)
    }
  }

  for (const currency of [...byCurrency.keys()].sort()) {
    const value = byCurrency.get(currency)!
    scopes.push({
      name: `financial:${currency}`,
      count: value.count,
      totalMinor: value.totalMinor,
      currency,
    })
  }

  return scopes
}

/**
 * Compares restored stats with the manifest. A count difference is reported
 * before a total difference because it is the structural signal.
 */
export function compareScopes(expected: ScopeStats[], actual: ScopeStats[]): VerificationResult {
  const remaining = new Map(actual.map(scope => [scope.name, scope]))
  const scopes: ScopeComparison[] = []

  for (const scope of expected) {
    const found = remaining.get(scope.name)
    remaining.delete(scope.name)

    if (!found) {
      scopes.push({
        scope: scope.name,
        expectedCount: scope.count,
        actualCount: 0,
        expectedTotalMinor: scope.totalMinor,
        actualTotalMinor: null,
        currency: scope.currency,
        status: 'failed',
        mismatchCode: 'scope_missing',
      })
      continue
    }

    if (found.count !== scope.count) {
      scopes.push({
        scope: scope.name,
        expectedCount: scope.count,
        actualCount: found.count,
        expectedTotalMinor: scope.totalMinor,
        actualTotalMinor: found.totalMinor,
        currency: scope.currency,
        status: 'failed',
        mismatchCode: 'count_mismatch',
      })
      continue
    }

    if (scope.totalMinor !== null && found.totalMinor !== scope.totalMinor) {
      scopes.push({
        scope: scope.name,
        expectedCount: scope.count,
        actualCount: found.count,
        expectedTotalMinor: scope.totalMinor,
        actualTotalMinor: found.totalMinor,
        currency: scope.currency,
        status: 'failed',
        mismatchCode: 'total_mismatch',
      })
      continue
    }

    scopes.push({
      scope: scope.name,
      expectedCount: scope.count,
      actualCount: found.count,
      expectedTotalMinor: scope.totalMinor,
      actualTotalMinor: found.totalMinor,
      currency: scope.currency,
      status: 'passed',
      mismatchCode: null,
    })
  }

  for (const extra of remaining.values()) {
    scopes.push({
      scope: extra.name,
      expectedCount: 0,
      actualCount: extra.count,
      expectedTotalMinor: null,
      actualTotalMinor: extra.totalMinor,
      currency: extra.currency,
      status: 'failed',
      mismatchCode: 'unexpected_scope',
    })
  }

  const failed = scopes.some(scope => scope.status === 'failed')
  return {
    status: failed ? 'failed' : 'passed',
    scopes,
    failureCode: failed ? 'scope_mismatch' : null,
  }
}
