import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { LocalObjectStorage, type ObjectStorage } from '@book-moto/storage'

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

export function getObjectStorage(): ObjectStorage {
  storage ??= new LocalObjectStorage(resolveStorageRoot())
  return storage
}
