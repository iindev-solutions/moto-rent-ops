import { describe, expect, it } from 'vitest'
import { compareScopes, type ScopeStats } from '@book-moto/db/recovery'

const counts: ScopeStats[] = [
  { name: 'motorcycles', count: 10, totalMinor: null, currency: null },
  { name: 'receipts', count: 4, totalMinor: null, currency: null },
  { name: 'financial:VND', count: 9, totalMinor: 12_500_000, currency: 'VND' },
  { name: 'financial:USD', count: 1, totalMinor: 500, currency: 'USD' },
]

const clone = (rows: ScopeStats[]): ScopeStats[] => rows.map(row => ({ ...row }))

describe('scope verification', () => {
  it('passes when every count and financial total matches', () => {
    const result = compareScopes(counts, clone(counts))
    expect(result.status).toBe('passed')
    expect(result.failureCode).toBeNull()
    expect(result.scopes.every(scope => scope.status === 'passed')).toBe(true)
  })

  it('reports a count mismatch for the exact scope', () => {
    const actual = clone(counts)
    actual[0]!.count = 9
    const result = compareScopes(counts, actual)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('scope_mismatch')
    const failed = result.scopes.find(scope => scope.scope === 'motorcycles')
    expect(failed).toMatchObject({
      expectedCount: 10,
      actualCount: 9,
      status: 'failed',
      mismatchCode: 'count_mismatch',
    })
    expect(result.scopes.find(scope => scope.scope === 'receipts')?.status).toBe('passed')
  })

  it('reports a total mismatch when counts match but money differs', () => {
    const actual = clone(counts)
    actual[2]!.totalMinor = 12_499_999
    const result = compareScopes(counts, actual)
    const failed = result.scopes.find(scope => scope.scope === 'financial:VND')
    expect(failed).toMatchObject({
      expectedCount: 9,
      actualCount: 9,
      expectedTotalMinor: 12_500_000,
      actualTotalMinor: 12_499_999,
      currency: 'VND',
      status: 'failed',
      mismatchCode: 'total_mismatch',
    })
    expect(result.scopes.find(scope => scope.scope === 'financial:USD')?.status).toBe('passed')
  })

  it('reports a missing scope and an unexpected scope', () => {
    const actual = clone(counts).filter(scope => scope.name !== 'receipts')
    actual.push({ name: 'ghost_table', count: 1, totalMinor: null, currency: null })
    const result = compareScopes(counts, actual)
    expect(result.scopes.find(scope => scope.scope === 'receipts')).toMatchObject({
      status: 'failed',
      actualCount: 0,
      mismatchCode: 'scope_missing',
    })
    expect(result.scopes.find(scope => scope.scope === 'ghost_table')).toMatchObject({
      status: 'failed',
      expectedCount: 0,
      mismatchCode: 'unexpected_scope',
    })
  })

  it('never drops a failed scope from the report', () => {
    const actual = clone(counts)
    actual[0]!.count = 0
    actual[2]!.totalMinor = 0
    const result = compareScopes(counts, actual)
    expect(result.scopes.filter(scope => scope.status === 'failed')).toHaveLength(2)
    expect(result.status).toBe('failed')
  })
})
