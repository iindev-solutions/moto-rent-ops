import { AwsClient } from 'aws4fetch'
import type { ObjectStorage } from './index'

export interface S3ObjectStorageOptions {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * S3-compatible object storage adapter (AWS S3, VNPT Cloud, MinIO).
 * Uses aws4fetch — tiny signing client, no AWS SDK dependency.
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: AwsClient
  private readonly baseUrl: string

  constructor(options: S3ObjectStorageOptions) {
    // Support both path-style (endpoint/bucket/key) and virtual-hosted style.
    const endpoint = options.endpoint.replace(/\/+$/, '')
    this.baseUrl = `${endpoint}/${options.bucket}`
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region || 'us-east-1',
      service: 's3',
    })
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const response = await this.client.fetch(`${this.baseUrl}/${encodeKey(key)}`, {
      method: 'PUT',
      body: body as unknown as BodyInit,
      headers: {
        'content-type': contentType,
      },
    })
    if (!response.ok) {
      throw new Error(`S3 put failed: ${response.status}`)
    }
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.fetch(`${this.baseUrl}/${encodeKey(key)}`, {
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(`S3 get failed: ${response.status}`)
    }
    const buffer = await response.arrayBuffer()
    return new Uint8Array(buffer)
  }

  async delete(key: string) {
    const response = await this.client.fetch(`${this.baseUrl}/${encodeKey(key)}`, {
      method: 'DELETE',
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed: ${response.status}`)
    }
  }
}

function encodeKey(key: string) {
  // Encode each path segment but keep '/' separators.
  return key.split('/').map(encodeURIComponent).join('/')
}
