import type { BikeSummary } from '@book-moto/contracts'
import { canonicalizeLocatorToken, canonicalizeManualCode } from '@book-moto/domain/qr'

/**
 * Offline cache for the minimum motorcycle card. It intentionally stores only
 * fleet fields that are already visible on the public QR landing card — never
 * clients, contracts, documents, money or audit history. Every record carries
 * `cachedAt` so the UI can mark it as a stale offline copy.
 */
export type CachedBikeCard = {
  id: string
  assetCode: string
  model: string
  plate: string | null
  photoUrl?: string | null
  status: string
  location: string | null
  nextAction: string | null
  qrToken: string | null
  manualCode: string | null
  cachedAt: number
}

const DB_NAME = 'moto-ops-cache'
const DB_VERSION = 1
const STORE_NAME = 'bike-cards'
const TOKEN_INDEX = 'token'
const MANUAL_INDEX = 'manualCode'
const CACHED_AT_INDEX = 'cachedAt'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

let dbPromise: Promise<IDBDatabase | null> | null = null

function openCacheDb(): Promise<IDBDatabase | null> {
  if (!import.meta.client || typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex(TOKEN_INDEX, 'qrToken')
        store.createIndex(MANUAL_INDEX, 'manualCode')
        store.createIndex(CACHED_AT_INDEX, 'cachedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return dbPromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true)
    transaction.onerror = () => resolve(false)
    transaction.onabort = () => resolve(false)
  })
}

function toRecord(bike: BikeSummary, cachedAt: number): CachedBikeCard | null {
  const qrToken = canonicalizeLocatorToken(bike.qrToken || '')
  const manualCode = canonicalizeManualCode(bike.manualCode || '')
  if (!qrToken && !manualCode) {
    return null
  }

  return {
    id: bike.id,
    assetCode: bike.assetCode,
    model: bike.model,
    plate: bike.plate,
    photoUrl: bike.photoUrl ?? null,
    status: bike.status,
    location: bike.location,
    nextAction: bike.nextAction,
    qrToken,
    manualCode,
    cachedAt,
  }
}

async function pruneExpiredBikes(database: IDBDatabase, now: number): Promise<void> {
  if (typeof IDBKeyRange === 'undefined') {
    return
  }

  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const request = transaction.objectStore(STORE_NAME).index(CACHED_AT_INDEX).openCursor(IDBKeyRange.upperBound(now - MAX_AGE_MS))
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) {
      return
    }
    cursor.delete()
    cursor.continue()
  }
  await transactionDone(transaction)
}

async function writeBikeCards(records: CachedBikeCard[]): Promise<void> {
  const database = await openCacheDb()
  if (!database || records.length === 0) {
    return
  }

  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    for (const record of records) {
      store.put(record)
    }
    const written = await transactionDone(transaction)
    if (written) {
      await pruneExpiredBikes(database, Date.now())
    }
  } catch {
    // Cache is a best-effort read-only convenience. Storage errors must never
    // block the online card or a financial operation.
  }
}

export async function cacheBikeCards(bikes: BikeSummary[]): Promise<void> {
  if (!import.meta.client) {
    return
  }
  const now = Date.now()
  const records: CachedBikeCard[] = []
  for (const bike of bikes) {
    const record = toRecord(bike, now)
    if (record) {
      records.push(record)
    }
  }
  await writeBikeCards(records)
}

export async function readCachedBike(locator: string): Promise<CachedBikeCard | null> {
  const token = canonicalizeLocatorToken(locator)
  const manualCode = token ? null : canonicalizeManualCode(locator)
  if (!token && !manualCode) {
    return null
  }

  const database = await openCacheDb()
  if (!database) {
    return null
  }

  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = token
      ? store.index(TOKEN_INDEX).get(token)
      : store.index(MANUAL_INDEX).get(manualCode as string)
    return await requestResult<CachedBikeCard>(request)
  } catch {
    return null
  }
}

export async function clearBikeCache(): Promise<void> {
  const database = await openCacheDb()
  if (!database) {
    return
  }

  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
    await transactionDone(transaction)
  } catch {
    // Ignore storage failures on sign-out.
  }
}
