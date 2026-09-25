import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import type { ObjectStorage } from './index'

function safeObjectKey(key: string) {
  const normalized = normalize(key).replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('../') || isAbsolute(normalized)) {
    throw new Error('Invalid storage key')
  }
  return normalized
}

export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  private pathFor(key: string) {
    const path = resolve(join(this.root, safeObjectKey(key)))
    const rootRelative = relative(this.root, path)
    if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) {
      throw new Error('Storage key escapes root')
    }
    return path
  }

  async put(key: string, body: Uint8Array, _contentType: string) {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
  }

  async get(key: string) {
    return readFile(this.pathFor(key))
  }

  async delete(key: string) {
    await unlink(this.pathFor(key))
  }
}
