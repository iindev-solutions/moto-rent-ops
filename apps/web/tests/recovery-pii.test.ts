import { describe, expect, it } from 'vitest'
import { serializeDrillDetail, serializeDrillListItem } from '../server/utils/recovery-report'

const drill = {
  id: '11111111-1111-1111-1111-111111111111',
  operatorUserId: '22222222-2222-2222-2222-222222222222',
  startedAt: new Date('2026-10-28T09:00:00.000Z'),
  finishedAt: new Date('2026-10-28T09:42:00.000Z'),
  targetEnvironment: 'isolated',
  artifactRef: 'recovery/2026-10-28T09-00-00Z',
  manifestChecksum: `sha256:${'a'.repeat(64)}`,
  status: 'passed',
  failureCode: null,
  createdAt: new Date('2026-10-28T09:00:00.000Z'),
  // Hostile extras: none of these may reach a response.
  operatorEmail: 'owner@example.com',
  operatorPhone: '+84900000000',
  clientName: 'Nguyen Van A',
  passportNumber: 'B1234567',
} as const

const scopes = [{
  id: '33333333-3333-3333-3333-333333333333',
  drillId: drill.id,
  scope: 'financial:VND',
  expectedCount: 11,
  actualCount: 11,
  expectedTotalMinor: 18_370_000,
  actualTotalMinor: 18_370_000,
  currency: 'VND',
  status: 'passed',
  mismatchCode: null,
  // Hostile extras.
  notes: 'client Nguyen Van A, passport B1234567',
}] as const

describe('evidence serialization', () => {
  it('returns only allowlisted list fields', () => {
    const result = serializeDrillListItem(drill, 'System Owner')
    expect(Object.keys(result).sort()).toEqual([
      'artifactRef',
      'failureCode',
      'finishedAt',
      'id',
      'operatorName',
      'startedAt',
      'status',
      'targetEnvironment',
    ].sort())
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/@|\+84|passport|Nguyen|B1234567/i)
  })

  it('returns only allowlisted detail fields and scopes', () => {
    const result = serializeDrillDetail(drill, scopes, 'System Owner')
    expect(Object.keys(result).sort()).toEqual([
      'artifactRef',
      'failureCode',
      'finishedAt',
      'id',
      'manifestChecksum',
      'operatorName',
      'scopes',
      'startedAt',
      'status',
      'targetEnvironment',
    ].sort())
    expect(Object.keys(result.scopes[0]!).sort()).toEqual([
      'actualCount',
      'actualTotalMinor',
      'currency',
      'expectedCount',
      'expectedTotalMinor',
      'mismatchCode',
      'scope',
      'status',
    ].sort())
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/@|\+84|passport|Nguyen|B1234567|notes/i)
  })
})
