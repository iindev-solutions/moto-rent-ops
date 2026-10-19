export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
}

import { LocalObjectStorage } from './local'
import { S3ObjectStorage } from './s3'

export { LocalObjectStorage, S3ObjectStorage }
export type { S3ObjectStorageOptions } from './s3'

export function createObjectStorage(options: {
  driver: 'local' | 's3'
  localRoot: string
  s3?: { endpoint: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string }
}): ObjectStorage {
  if (options.driver === 's3') {
    if (!options.s3?.endpoint || !options.s3.bucket || !options.s3.accessKeyId || !options.s3.secretAccessKey) {
      throw new Error('S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY')
    }
    return new S3ObjectStorage(options.s3)
  }
  return new LocalObjectStorage(options.localRoot)
}
