import { describe, expect, it } from 'vitest'
import { RecoveryIsolationError, assertIsolatedTarget } from '@book-moto/db/recovery'

const production = 'pglite:/srv/production/pglite'

describe('isolation guard', () => {
  it('refuses a restore when the isolated marker is missing', () => {
    expect(() => assertIsolatedTarget({
      targetFingerprint: 'pglite:/tmp/restore',
    })).toThrow(RecoveryIsolationError)
  })

  it('refuses a marker other than isolated', () => {
    expect(() => assertIsolatedTarget({
      targetEnvironment: 'production',
      targetFingerprint: 'pglite:/tmp/restore',
    })).toThrow(/isolated/i)
  })

  it('refuses a target that matches the configured production fingerprint', () => {
    expect(() => assertIsolatedTarget({
      targetEnvironment: 'isolated',
      targetFingerprint: production,
      productionFingerprints: [production],
    })).toThrow(/production/i)
  })

  it('refuses a target that equals the source database', () => {
    expect(() => assertIsolatedTarget({
      targetEnvironment: 'isolated',
      targetFingerprint: 'pglite:/tmp/source',
      sourceFingerprint: 'pglite:/tmp/source',
    })).toThrow(/source/i)
  })

  it('refuses an empty target fingerprint', () => {
    expect(() => assertIsolatedTarget({
      targetEnvironment: 'isolated',
      targetFingerprint: '   ',
    })).toThrow(/fingerprint/i)
  })

  it('accepts an isolated target with a distinct fingerprint', () => {
    expect(() => assertIsolatedTarget({
      targetEnvironment: 'isolated',
      targetFingerprint: 'pglite:/tmp/restore',
      productionFingerprints: [production],
      sourceFingerprint: 'pglite:/tmp/source',
    })).not.toThrow()
  })
})
