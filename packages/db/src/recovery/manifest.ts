import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  RECOVERY_MANIFEST_VERSION,
  RECOVERY_SOURCE_ENVIRONMENTS,
  type BackupManifest,
  type ManifestDocument,
  type ScopeStats,
} from './types'

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const MANIFEST_FILE = 'manifest.json'

export function sha256Hex(input: Uint8Array | string): string {
  const hash = createHash('sha256')
  hash.update(input)
  return `sha256:${hash.digest('hex')}`
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer)
  }
  return `sha256:${hash.digest('hex')}`
}

/** Rejects absolute paths and any segment that would escape the root. */
export function resolveArtifactPath(root: string, candidate: string): string {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error('Invalid artifact path: path is empty')
  }
  const normalized = candidate.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || isAbsolute(normalized)) {
    throw new Error('Invalid artifact path: absolute paths are not allowed')
  }
  if (normalized.split('/').includes('..')) {
    throw new Error('Invalid artifact path: parent traversal is not allowed')
  }
  const rootPath = resolve(root)
  const target = resolve(rootPath, normalized)
  const rel = relative(rootPath, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Invalid artifact path: path escapes the artifact root')
  }
  return target
}

async function walkFiles(root: string, current: string, files: string[]) {
  const entries = await readdir(current, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    // PGlite writes this only while a server is attached; it is not data.
    if (entry.name === 'postmaster.pid') continue
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(root, path, files)
    } else {
      files.push(path)
    }
  }
}

/**
 * Deterministic content hash of a directory tree. File order does not matter;
 * relative path, size and content do.
 */
export async function hashDirectory(root: string): Promise<{ checksum: string, bytes: number }> {
  const files: string[] = []
  await walkFiles(root, root, files)
  const hash = createHash('sha256')
  let bytes = 0
  for (const file of files) {
    const relativePath = relative(root, file).replaceAll('\\', '/')
    const content = await readFile(file)
    hash.update(relativePath)
    hash.update('\0')
    hash.update(String(content.byteLength))
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
    bytes += content.byteLength
  }
  return { checksum: `sha256:${hash.digest('hex')}`, bytes }
}

export function serializeManifest(manifest: BackupManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function canonicalDocument(value: unknown): ManifestDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid manifest: document entry is not an object')
  const entry = value as Record<string, unknown>
  if (typeof entry.storageKey !== 'string' || entry.storageKey.trim() === '') {
    throw new Error('Invalid manifest: document storage key is required')
  }
  if (typeof entry.contentType !== 'string' || entry.contentType.trim() === '') {
    throw new Error('Invalid manifest: document content type is required')
  }
  if (typeof entry.path !== 'string') throw new Error('Invalid manifest: document path is required')
  // Throws the shared path error when the entry escapes the artifact root.
  resolveArtifactPath('.', entry.path)
  if (typeof entry.checksum !== 'string' || !CHECKSUM_PATTERN.test(entry.checksum)) {
    throw new Error('Invalid manifest: document checksum is malformed')
  }
  if (!isNonNegativeInteger(entry.bytes)) {
    throw new Error('Invalid manifest: document bytes must be a non-negative integer')
  }
  return {
    storageKey: entry.storageKey,
    contentType: entry.contentType,
    path: entry.path.replaceAll('\\', '/'),
    checksum: entry.checksum,
    bytes: entry.bytes,
  }
}

function canonicalScope(value: unknown): ScopeStats {
  if (!value || typeof value !== 'object') throw new Error('Invalid manifest: scope is not an object')
  const entry = value as Record<string, unknown>
  if (typeof entry.name !== 'string' || entry.name.trim() === '') {
    throw new Error('Invalid manifest: scope name is required')
  }
  if (!isNonNegativeInteger(entry.count)) {
    throw new Error('Invalid manifest: scope count must be a non-negative integer')
  }
  const financial = entry.name.startsWith('financial:')
  if (financial) {
    if (!isNonNegativeInteger(entry.totalMinor)) {
      throw new Error('Invalid manifest: financial scope total must be a non-negative integer')
    }
    if (typeof entry.currency !== 'string' || !CURRENCY_PATTERN.test(entry.currency)) {
      throw new Error('Invalid manifest: financial scope currency is malformed')
    }
    return { name: entry.name, count: entry.count, totalMinor: entry.totalMinor, currency: entry.currency }
  }
  if (entry.totalMinor !== null || entry.currency !== null) {
    throw new Error('Invalid manifest: non-financial scope must not carry a total or currency')
  }
  return { name: entry.name, count: entry.count, totalMinor: null, currency: null }
}

/** Validates an unknown value and returns a canonical, allowlisted manifest. */
export function validateManifest(value: unknown): BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid manifest: expected an object')
  const input = value as Record<string, unknown>

  if (input.manifestVersion !== RECOVERY_MANIFEST_VERSION) {
    throw new Error(`Invalid manifest: unsupported manifest version ${String(input.manifestVersion)}`)
  }
  if (typeof input.createdAt !== 'string' || Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error('Invalid manifest: createdAt is not a timestamp')
  }
  if (typeof input.sourceEnvironment !== 'string'
    || !(RECOVERY_SOURCE_ENVIRONMENTS as readonly string[]).includes(input.sourceEnvironment)) {
    throw new Error('Invalid manifest: sourceEnvironment is not allowlisted')
  }
  if (typeof input.dataFormatVersion !== 'string' || input.dataFormatVersion.trim() === '') {
    throw new Error('Invalid manifest: dataFormatVersion is required')
  }
  if (typeof input.databaseChecksum !== 'string' || !CHECKSUM_PATTERN.test(input.databaseChecksum)) {
    throw new Error('Invalid manifest: database checksum is malformed')
  }
  if (!isNonNegativeInteger(input.databaseBytes)) {
    throw new Error('Invalid manifest: database bytes must be a non-negative integer')
  }
  if (!Array.isArray(input.documents)) throw new Error('Invalid manifest: documents must be an array')
  if (!Array.isArray(input.scopes)) throw new Error('Invalid manifest: scopes must be an array')
  if (typeof input.toolVersion !== 'string' || input.toolVersion.trim() === '') {
    throw new Error('Invalid manifest: toolVersion is required')
  }

  const documents = input.documents.map(canonicalDocument)
  const paths = new Set<string>()
  for (const document of documents) {
    if (paths.has(document.path)) throw new Error('Invalid manifest: duplicate document path')
    paths.add(document.path)
  }

  return {
    manifestVersion: RECOVERY_MANIFEST_VERSION,
    createdAt: input.createdAt,
    sourceEnvironment: input.sourceEnvironment,
    dataFormatVersion: input.dataFormatVersion,
    databaseChecksum: input.databaseChecksum,
    databaseBytes: input.databaseBytes,
    documents,
    scopes: input.scopes.map(canonicalScope),
    toolVersion: input.toolVersion,
  }
}

export async function writeManifest(root: string, manifest: BackupManifest) {
  const canonical = validateManifest(manifest)
  const serialized = serializeManifest(canonical)
  const checksum = sha256Hex(serialized)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, MANIFEST_FILE), serialized, 'utf8')
  return { path: join(root, MANIFEST_FILE), checksum, manifest: canonical }
}

export async function readManifest(root: string) {
  const path = join(root, MANIFEST_FILE)
  const raw = await readFile(path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid manifest: not valid JSON')
  }
  const manifest = validateManifest(parsed)
  const serialized = serializeManifest(manifest)
  if (serialized !== raw) {
    throw new Error('Invalid manifest: file is not canonical and may have been edited')
  }
  return { manifest, checksum: sha256Hex(serialized), path }
}
