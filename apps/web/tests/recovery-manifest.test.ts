import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RECOVERY_MANIFEST_VERSION,
  hashDirectory,
  readManifest,
  resolveArtifactPath,
  serializeManifest,
  sha256Hex,
  validateManifest,
  writeManifest,
  type BackupManifest,
} from '@book-moto/db/recovery'

const HEX_A = `sha256:${'a'.repeat(64)}`
const HEX_B = `sha256:${'b'.repeat(64)}`

function manifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    manifestVersion: RECOVERY_MANIFEST_VERSION,
    createdAt: '2026-10-28T09:00:00.000Z',
    sourceEnvironment: 'development',
    dataFormatVersion: '0020',
    databaseChecksum: HEX_A,
    databaseBytes: 1024,
    documents: [{
      storageKey: 'attachments/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg',
      contentType: 'image/jpeg',
      path: 'documents/abc123',
      checksum: HEX_B,
      bytes: 10,
    }],
    scopes: [
      { name: 'motorcycles', count: 10, totalMinor: null, currency: null },
      { name: 'financial:VND', count: 5, totalMinor: 1_000, currency: 'VND' },
    ],
    toolVersion: '1.0.0',
    ...overrides,
  }
}

const workspaces: string[] = []

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'recovery-manifest-'))
  workspaces.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('manifest checksums', () => {
  it('uses the standard SHA-256 hex digest', () => {
    expect(sha256Hex(new TextEncoder().encode('abc')))
      .toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes a directory deterministically regardless of file creation order', async () => {
    const first = await workspace()
    const second = await workspace()
    await writeFile(join(first, 'a.txt'), 'alpha')
    await writeFile(join(first, 'b.txt'), 'bravo')
    await writeFile(join(second, 'b.txt'), 'bravo')
    await writeFile(join(second, 'a.txt'), 'alpha')

    const a = await hashDirectory(first)
    const b = await hashDirectory(second)
    expect(a.checksum).toBe(b.checksum)
    expect(a.checksum).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(a.bytes).toBe(10)
  })

  it('changes the directory checksum when content changes', async () => {
    const dir = await workspace()
    await writeFile(join(dir, 'a.txt'), 'alpha')
    const before = await hashDirectory(dir)
    await writeFile(join(dir, 'a.txt'), 'alpha!')
    const after = await hashDirectory(dir)
    expect(after.checksum).not.toBe(before.checksum)
  })
})

describe('manifest serialization', () => {
  it('writes and reads a manifest with a matching checksum', async () => {
    const dir = await workspace()
    const source = manifest()
    const written = await writeManifest(dir, source)
    const read = await readManifest(dir)
    expect(read.manifest).toEqual(source)
    expect(read.checksum).toBe(written.checksum)
    expect(read.checksum).toBe(sha256Hex(new TextEncoder().encode(serializeManifest(source))))
  })
})

describe('manifest validation', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(manifest())).toEqual(manifest())
  })

  it('rejects a document path that escapes the artifact root', () => {
    const bad = manifest({ documents: [{ ...manifest().documents[0]!, path: '../evil' }] })
    expect(() => validateManifest(bad)).toThrow(/path/i)
  })

  it('rejects an absolute document path', () => {
    const bad = manifest({ documents: [{ ...manifest().documents[0]!, path: '/etc/passwd' }] })
    expect(() => validateManifest(bad)).toThrow(/path/i)
  })

  it('rejects a malformed checksum and negative sizes', () => {
    expect(() => validateManifest(manifest({ databaseChecksum: 'nope' }))).toThrow(/checksum/i)
    expect(() => validateManifest(manifest({ databaseBytes: -1 }))).toThrow(/bytes/i)
  })

  it('rejects a financial scope without a currency and a non-financial scope with a total', () => {
    expect(() => validateManifest(manifest({ scopes: [{ name: 'financial:VND', count: 1, totalMinor: 5, currency: null }] }))).toThrow()
    expect(() => validateManifest(manifest({ scopes: [{ name: 'motorcycles', count: 1, totalMinor: 5, currency: 'VND' }] }))).toThrow()
  })
})

describe('artifact path resolution', () => {
  it('resolves a relative path inside the artifact root', () => {
    const root = join(tmpdir(), 'recovery-root')
    expect(resolveArtifactPath(root, 'documents/abc')).toBe(join(root, 'documents', 'abc'))
  })

  it('rejects traversal and absolute paths', () => {
    const root = join(tmpdir(), 'recovery-root')
    expect(() => resolveArtifactPath(root, '../escape')).toThrow(/path/i)
    expect(() => resolveArtifactPath(root, 'documents/../../escape')).toThrow(/path/i)
    expect(() => resolveArtifactPath(root, '/etc/passwd')).toThrow(/path/i)
    expect(() => resolveArtifactPath(root, 'C:\\Windows\\system32')).toThrow(/path/i)
    expect(() => resolveArtifactPath(root, '')).toThrow(/path/i)
  })
})
