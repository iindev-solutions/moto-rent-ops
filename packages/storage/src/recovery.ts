import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ObjectStorage } from './index'

export interface DocumentSelector {
  storageKey: string
  contentType: string
}

export interface DocumentBackupEntry extends DocumentSelector {
  /** Path relative to the artifact root. */
  path: string
  checksum: string
  bytes: number
}

export type DocumentRecoveryCode = 'document_missing' | 'document_checksum_mismatch' | 'artifact_path_invalid'

export class DocumentRecoveryError extends Error {
  constructor(readonly code: DocumentRecoveryCode, message: string) {
    super(message)
    this.name = 'DocumentRecoveryError'
  }
}

function checksumOf(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function safeArtifactPath(root: string, candidate: string): string {
  const normalized = candidate.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || isAbsolute(normalized)) {
    throw new DocumentRecoveryError('artifact_path_invalid', 'Invalid document artifact path')
  }
  if (normalized.split('/').includes('..')) {
    throw new DocumentRecoveryError('artifact_path_invalid', 'Document artifact path escapes the artifact root')
  }
  const rootPath = resolve(root)
  const target = resolve(rootPath, normalized)
  const rel = relative(rootPath, target)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new DocumentRecoveryError('artifact_path_invalid', 'Document artifact path escapes the artifact root')
  }
  return target
}

/**
 * Copies every selected object into `<artifact>/documents`. The file name is
 * derived from the storage key so a restore is deterministic and never trusts
 * an operator-supplied path.
 */
export async function backupDocuments(options: {
  storage: ObjectStorage
  documents: DocumentSelector[]
  artifactDir: string
}): Promise<DocumentBackupEntry[]> {
  const directory = join(options.artifactDir, 'documents')
  await mkdir(directory, { recursive: true })

  const entries: DocumentBackupEntry[] = []
  for (const document of options.documents) {
    let bytes: Uint8Array
    try {
      bytes = await options.storage.get(document.storageKey)
    } catch {
      throw new DocumentRecoveryError(
        'document_missing',
        `Stored document is missing for key ${document.storageKey}`,
      )
    }

    const fileName = createHash('sha256').update(document.storageKey).digest('hex')
    const relativePath = `documents/${fileName}`
    const target = safeArtifactPath(options.artifactDir, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    entries.push({
      storageKey: document.storageKey,
      contentType: document.contentType,
      path: relativePath,
      checksum: checksumOf(bytes),
      bytes: bytes.byteLength,
    })
  }

  entries.sort((left, right) => left.path.localeCompare(right.path))
  return entries
}

/** Re-hashes every artifact document before writing it into the target storage. */
export async function restoreDocuments(options: {
  storage: ObjectStorage
  entries: DocumentBackupEntry[]
  artifactDir: string
}): Promise<void> {
  for (const entry of options.entries) {
    const path = safeArtifactPath(options.artifactDir, entry.path)
    let bytes: Uint8Array
    try {
      bytes = await readFile(path)
    } catch {
      throw new DocumentRecoveryError('document_missing', 'A document is missing from the backup artifact')
    }
    if (checksumOf(bytes) !== entry.checksum) {
      throw new DocumentRecoveryError('document_checksum_mismatch', 'A document checksum does not match the manifest')
    }
    await options.storage.put(entry.storageKey, bytes, entry.contentType)
  }
}

/** Reads restored objects back from the target and compares their checksums. */
export async function verifyRestoredDocuments(options: {
  storage: ObjectStorage
  entries: DocumentBackupEntry[]
}): Promise<void> {
  for (const entry of options.entries) {
    let bytes: Uint8Array
    try {
      bytes = await options.storage.get(entry.storageKey)
    } catch {
      throw new DocumentRecoveryError('document_missing', 'A restored document is missing from the target storage')
    }
    if (checksumOf(bytes) !== entry.checksum) {
      throw new DocumentRecoveryError('document_checksum_mismatch', 'A restored document checksum does not match the manifest')
    }
  }
}
