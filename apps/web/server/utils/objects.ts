import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { createObjectStorage, type ObjectStorage } from '@book-moto/storage'

function findRepoRoot(start: string) {
  let current = resolve(start)
  while (true) {
    if (existsSync(join(current, 'packages/db/migrations')) && existsSync(join(current, 'package.json'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return resolve(start)
    }
    current = parent
  }
}

function resolveStorageRoot() {
  const endpoint = process.env.S3_ENDPOINT
  if (endpoint?.startsWith('file://')) {
    const raw = endpoint.slice('file://'.length)
    return isAbsolute(raw) ? raw : resolve(findRepoRoot(process.cwd()), raw)
  }
  return resolve(findRepoRoot(process.cwd()), '.data/documents')
}

let storage: ObjectStorage | undefined

/**
 * Storage driver selection:
 * - S3_ENDPOINT starting with `file://` or unset S3_ACCESS_KEY_ID → local filesystem (dev default)
 * - otherwise → S3-compatible object storage (VNPT/S3/MinIO) signed with the configured credentials
 */
export function getObjectStorage(): ObjectStorage {
  if (storage) return storage

  const s3Configured = Boolean(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_BUCKET)
  const endpoint = process.env.S3_ENDPOINT
  const localOnly = !s3Configured || !endpoint || endpoint.startsWith('file://')

  storage = createObjectStorage({
    driver: localOnly ? 'local' : 's3',
    localRoot: resolveStorageRoot(),
    s3: s3Configured && !localOnly
      ? {
          endpoint: endpoint as string,
          region: process.env.S3_REGION || 'us-east-1',
          bucket: process.env.S3_BUCKET as string,
          accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
        }
      : undefined,
  })
  return storage
}
