import { createHash, randomUUID } from 'node:crypto'
import { eq, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import { canonicalizeLocatorToken, generateManualCode } from '@book-moto/domain/qr'
import {
  allocations,
  auditEvents,
  clientContacts,
  clients,
  depositDispositions,
  deposits,
  documentCustodies,
  getDb,
  legacyImportBatches,
  legacyImportRows,
  locationAssignments,
  motorcycles,
  obligations,
  qrIdentities,
  qrPayloads,
  receipts,
  rentalAgreementVersions,
  rentalAgreements,
  rentalItems,
  type AppDatabase,
  type DbTransaction,
} from '@book-moto/db'
import { encryptLocatorToken, hashLocatorToken } from '@book-moto/db/crypto'

const IMPORT_TABLES = [
  'clients',
  'motorcycles',
  'agreements',
  'rentalItems',
  'obligations',
  'receipts',
  'deposits',
  'documentCustodies',
] as const

type ImportTable = typeof IMPORT_TABLES[number]
type RowStatus = 'valid' | 'invalid' | 'duplicate' | 'imported' | 'skipped'

const TARGET_ENTITY: Record<ImportTable, string> = {
  clients: 'clients',
  motorcycles: 'motorcycles',
  agreements: 'rental_agreements',
  rentalItems: 'rental_items',
  obligations: 'obligations',
  receipts: 'receipts',
  deposits: 'deposits',
  documentCustodies: 'document_custodies',
}

const sourceIdSchema = z.string().trim().min(1).max(120)
const isoDateSchema = z.string().trim().min(1).refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO date')
const currencySchema = z.string().trim().regex(/^[A-Z]{3}$/, 'must be a 3-letter uppercase currency code')
const amountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const nullableDateSchema = isoDateSchema.nullable().optional()

const contactSchema = z.object({
  channel: z.string().trim().min(1).max(32),
  value: z.string().trim().min(1).max(240),
  isPrimary: z.boolean().default(false),
})

const clientSchema = z.object({
  sourceId: sourceIdSchema,
  displayName: z.string().trim().min(1).max(160),
  preferredChannel: z.string().trim().min(1).max(32).default('phone'),
  notes: z.string().max(5000).nullable().optional(),
  contacts: z.array(contactSchema).max(20).default([]),
})

const motorcycleSchema = z.object({
  sourceId: sourceIdSchema,
  assetCode: z.string().trim().min(1).max(32),
  model: z.string().trim().min(1).max(120),
  plate: z.string().trim().max(32).nullable().optional(),
  status: z.enum(['available', 'reserved', 'rented', 'inspection', 'maintenance', 'blocked', 'retired']),
  location: z.string().trim().max(120).nullable().optional(),
  nextAction: z.string().trim().max(240).nullable().optional(),
})

const agreementSchema = z.object({
  sourceId: sourceIdSchema,
  clientSourceId: sourceIdSchema,
  status: z.enum(['draft', 'ready', 'active', 'returned', 'closed', 'cancelled']),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
  notes: z.string().max(5000).nullable().optional(),
})

const rentalItemSchema = z.object({
  sourceId: sourceIdSchema,
  agreementSourceId: sourceIdSchema,
  motorcycleSourceId: sourceIdSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  dailyRateMinor: amountSchema,
  currency: currencySchema.default('VND'),
  status: z.enum(['planned', 'active', 'returned', 'cancelled']),
})

const allocationSchema = z.object({
  obligationSourceId: sourceIdSchema,
  amountMinor: amountSchema,
})

const receiptSchema = z.object({
  sourceId: sourceIdSchema,
  clientSourceId: sourceIdSchema.nullable().optional(),
  amountMinor: amountSchema,
  currency: currencySchema.default('VND'),
  method: z.string().trim().min(1).max(32),
  receivedAt: isoDateSchema,
  notes: z.string().max(5000).nullable().optional(),
  allocations: z.array(allocationSchema).max(100).default([]),
})

const obligationSchema = z.object({
  sourceId: sourceIdSchema,
  clientSourceId: sourceIdSchema.nullable().optional(),
  agreementSourceId: sourceIdSchema.nullable().optional(),
  rentalItemSourceId: sourceIdSchema.nullable().optional(),
  type: z.string().trim().min(1).max(32),
  amountMinor: amountSchema,
  currency: currencySchema.default('VND'),
  dueDate: nullableDateSchema,
  notes: z.string().max(5000).nullable().optional(),
})

const depositDispositionSchema = z.object({
  type: z.enum(['applied', 'returned']),
  obligationSourceId: sourceIdSchema.nullable().optional(),
  amountMinor: amountSchema,
})

const depositSchema = z.object({
  sourceId: sourceIdSchema,
  clientSourceId: sourceIdSchema,
  agreementSourceId: sourceIdSchema.nullable().optional(),
  type: z.enum(['cash', 'document_custody']),
  status: z.enum(['held', 'applied', 'returned']),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  currency: currencySchema.default('VND'),
  documentCustodySourceId: sourceIdSchema.nullable().optional(),
  appliedObligationSourceId: sourceIdSchema.nullable().optional(),
  receivedAt: isoDateSchema,
  returnedAt: nullableDateSchema,
  notes: z.string().max(5000).nullable().optional(),
  dispositions: z.array(depositDispositionSchema).max(100).default([]),
})

const documentCustodySchema = z.object({
  sourceId: sourceIdSchema,
  clientSourceId: sourceIdSchema,
  documentType: z.string().trim().min(1).max(64),
  maskedNumber: z.string().trim().max(64).nullable().optional(),
  expiresAt: nullableDateSchema,
  status: z.enum(['held', 'returned']),
  receivedAt: isoDateSchema,
  returnedAt: nullableDateSchema,
  notes: z.string().max(5000).nullable().optional(),
})

const schemas: Record<ImportTable, z.ZodTypeAny> = {
  clients: clientSchema,
  motorcycles: motorcycleSchema,
  agreements: agreementSchema,
  rentalItems: rentalItemSchema,
  obligations: obligationSchema,
  receipts: receiptSchema,
  deposits: depositSchema,
  documentCustodies: documentCustodySchema,
}

const snapshotSchema = z.object({
  clients: z.array(z.unknown()).optional().default([]),
  motorcycles: z.array(z.unknown()).optional().default([]),
  agreements: z.array(z.unknown()).optional().default([]),
  rentalItems: z.array(z.unknown()).optional().default([]),
  obligations: z.array(z.unknown()).optional().default([]),
  receipts: z.array(z.unknown()).optional().default([]),
  deposits: z.array(z.unknown()).optional().default([]),
  documentCustodies: z.array(z.unknown()).optional().default([]),
})

type ParsedClient = z.infer<typeof clientSchema>
type ParsedMotorcycle = z.infer<typeof motorcycleSchema>
type ParsedAgreement = z.infer<typeof agreementSchema>
type ParsedRentalItem = z.infer<typeof rentalItemSchema>
type ParsedObligation = z.infer<typeof obligationSchema>
type ParsedReceipt = z.infer<typeof receiptSchema>
type ParsedDeposit = z.infer<typeof depositSchema>
type ParsedDocumentCustody = z.infer<typeof documentCustodySchema>

type ParsedByTable = {
  clients: ParsedClient
  motorcycles: ParsedMotorcycle
  agreements: ParsedAgreement
  rentalItems: ParsedRentalItem
  obligations: ParsedObligation
  receipts: ParsedReceipt
  deposits: ParsedDeposit
  documentCustodies: ParsedDocumentCustody
}

type RawRow = {
  table: ImportTable
  sourceId: string
  payload: Record<string, unknown>
  sourceHash: string
}

type PreparedRow = RawRow & {
  stagingId: string
  data: ParsedByTable[ImportTable] | null
  status: RowStatus
  errors: string[]
  targetId: string
  targetEntityType: string
}

export type LegacyImportTableReport = {
  total: number
  valid: number
  invalid: number
  duplicate: number
  imported: number
}

export type LegacyImportReport = {
  mode: 'dry-run' | 'apply'
  tables: Record<ImportTable, LegacyImportTableReport>
  sourceTotals: Record<string, number>
  importableTotals: Record<string, number>
  issues: Array<{ sourceTable: ImportTable, sourceId: string, errors: string[] }>
}

export type LegacyImportResult = {
  batchId: string
  status: 'dry_run' | 'applied' | 'failed'
  report: LegacyImportReport
  counts: LegacyImportTableReport & { total: number }
}

export class LegacyImportInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacyImportInputError'
  }
}

export class LegacyImportValidationError extends Error {
  readonly batchId: string
  readonly report: LegacyImportReport

  constructor(batchId: string, report: LegacyImportReport) {
    super('Legacy import has invalid rows; nothing was applied')
    this.name = 'LegacyImportValidationError'
    this.batchId = batchId
    this.report = report
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonical((value as Record<string, unknown>)[key])
        return result
      }, {})
  }
  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonical(value))
}

export function legacySourceHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export function deterministicLegacyId(table: string, sourceId: string): string {
  const hash = createHash('sha256').update(`moto-ops-legacy-v1:${table}:${sourceId}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function iso(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

function sumByCurrency(rows: Array<{ amountMinor: number, currency: string }>): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    totals[row.currency] = (totals[row.currency] ?? 0) + row.amountMinor
  }
  return totals
}

function emptyTableReport(): LegacyImportTableReport {
  return { total: 0, valid: 0, invalid: 0, duplicate: 0, imported: 0 }
}

function buildReport(mode: 'dry-run' | 'apply', rows: PreparedRow[]): LegacyImportReport {
  const tables = Object.fromEntries(IMPORT_TABLES.map((table) => [table, emptyTableReport()])) as Record<ImportTable, LegacyImportTableReport>
  const issues: LegacyImportReport['issues'] = []
  for (const row of rows) {
    const table = tables[row.table]
    table.total += 1
    if (row.status === 'valid') table.valid += 1
    else if (row.status === 'duplicate') table.duplicate += 1
    else if (row.status === 'imported') table.imported += 1
    else if (row.status === 'skipped') table.valid += 1
    else table.invalid += 1
    if (row.errors.length) issues.push({ sourceTable: row.table, sourceId: row.sourceId, errors: row.errors })
  }

  const sourceTotals: Record<string, number> = {}
  const importableTotals: Record<string, number> = {}
  const add = (target: Record<string, number>, key: string, amount: number) => {
    target[key] = (target[key] ?? 0) + amount
  }
  for (const row of rows) {
    if (!row.data) continue
    if (row.table === 'obligations') {
      const obligation = row.data as ParsedObligation
      add(sourceTotals, `obligations:${obligation.currency}`, obligation.amountMinor)
      if (['valid', 'duplicate', 'imported'].includes(row.status)) add(importableTotals, `obligations:${obligation.currency}`, obligation.amountMinor)
    }
    if (row.table === 'receipts') {
      const receipt = row.data as ParsedReceipt
      add(sourceTotals, `receipts:${receipt.currency}`, receipt.amountMinor)
      if (['valid', 'duplicate', 'imported'].includes(row.status)) add(importableTotals, `receipts:${receipt.currency}`, receipt.amountMinor)
      for (const allocation of receipt.allocations) {
        add(sourceTotals, `allocations:${receipt.currency}`, allocation.amountMinor)
        if (['valid', 'duplicate', 'imported'].includes(row.status)) add(importableTotals, `allocations:${receipt.currency}`, allocation.amountMinor)
      }
    }
    if (row.table === 'deposits') {
      const deposit = row.data as ParsedDeposit
      if (deposit.amountMinor != null) {
        add(sourceTotals, `deposits:${deposit.currency}`, deposit.amountMinor)
        if (['valid', 'duplicate', 'imported'].includes(row.status)) add(importableTotals, `deposits:${deposit.currency}`, deposit.amountMinor)
      }
      for (const disposition of deposit.dispositions) {
        add(sourceTotals, `deposit_dispositions:${deposit.currency}`, disposition.amountMinor)
        if (['valid', 'duplicate', 'imported'].includes(row.status)) add(importableTotals, `deposit_dispositions:${deposit.currency}`, disposition.amountMinor)
      }
    }
  }

  return { mode, tables, sourceTotals, importableTotals, issues }
}

function rowData<T extends ImportTable>(row: PreparedRow, table: T): ParsedByTable[T] | null {
  return row.table === table ? row.data as ParsedByTable[T] | null : null
}

function addError(row: PreparedRow, message: string) {
  if (!row.errors.includes(message)) row.errors.push(message)
  row.status = 'invalid'
}

async function existingIds(db: AppDatabase, table: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await db.select({ id: table.id }).from(table).where(inArray(table.id, ids))
  return new Set(rows.map((row: { id: string }) => row.id))
}

async function insertOne(tx: DbTransaction, table: any, values: Record<string, unknown>): Promise<Record<string, any> | null> {
  if (typeof values.id !== 'string') throw new Error('Legacy import inserts require a deterministic id')
  const rows = await (tx.insert(table) as any).values(values).onConflictDoNothing().returning()
  if (rows[0]) return rows[0]

  // A no-op insert is only valid for an idempotent replay of the same target
  // id. Any other unique conflict (for example a manually created asset code)
  // must abort the batch instead of being silently reported as a duplicate.
  const [existing] = await tx.select({ id: table.id }).from(table).where(eq(table.id, values.id)).limit(1)
  if (existing) return null
  throw new Error(`Legacy import target conflict for ${values.id}`)
}

async function updateStagingRow(tx: DbTransaction, row: PreparedRow, status: RowStatus) {
  await tx.update(legacyImportRows).set({
    status,
    targetEntityType: row.targetEntityType,
    targetEntityId: row.targetId,
    updatedAt: new Date(),
  }).where(eq(legacyImportRows.id, row.stagingId))
}

function qrCredentials() {
  const token = canonicalizeLocatorToken(randomUUID())
  if (!token) throw new Error('Could not generate locator token')
  return {
    token,
    manualCode: generateManualCode(),
    tokenHash: hashLocatorToken(token),
    tokenCiphertext: encryptLocatorToken(token),
  }
}

async function uniqueQrCredentials(tx: DbTransaction) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const credentials = qrCredentials()
    const [existing] = await tx.select({ id: qrPayloads.id }).from(qrPayloads).where(or(
      eq(qrPayloads.manualCode, credentials.manualCode),
      eq(qrPayloads.tokenHash, credentials.tokenHash),
    )).limit(1)
    if (!existing) return credentials
  }
  throw new Error('Could not allocate a unique manual code')
}

async function applyRows(tx: DbTransaction, rows: PreparedRow[], createdByUserId: string | null, batchId: string) {
  const byTable = (table: ImportTable) => rows.filter((row) => row.table === table)
  const valid = (table: ImportTable) => byTable(table).filter((row) => row.status === 'valid')
  let imported = 0

  const mark = async (row: PreparedRow, inserted: boolean) => {
    if (inserted) {
      imported += 1
      row.status = 'imported'
      await updateStagingRow(tx, row, 'imported')
    } else {
      row.status = 'duplicate'
      await updateStagingRow(tx, row, 'duplicate')
    }
  }

  // Clients and contacts.
  for (const row of valid('clients')) {
    const data = rowData(row, 'clients')!
    const inserted = await insertOne(tx, clients, {
      id: row.targetId,
      displayName: data.displayName,
      preferredChannel: data.preferredChannel,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
    if (inserted) {
      for (const [index, contact] of data.contacts.entries()) {
        await insertOne(tx, clientContacts, {
          id: deterministicLegacyId('client_contacts', `${data.sourceId}:${index}`),
          clientId: row.targetId,
          channel: contact.channel,
          value: contact.value,
          isPrimary: contact.isPrimary,
        })
      }
    }
  }

  // Documents before deposits because deposits can reference custody.
  for (const row of valid('documentCustodies')) {
    const data = rowData(row, 'documentCustodies')!
    const clientRow = rows.find((candidate) => candidate.table === 'clients' && candidate.sourceId === data.clientSourceId)
    const inserted = await insertOne(tx, documentCustodies, {
      id: row.targetId,
      clientId: clientRow?.targetId ?? deterministicLegacyId('clients', data.clientSourceId),
      documentType: data.documentType,
      maskedNumber: data.maskedNumber ?? null,
      expiresAt: iso(data.expiresAt),
      status: data.status,
      receivedAt: iso(data.receivedAt) ?? new Date(),
      returnedAt: iso(data.returnedAt),
      receivedByUserId: createdByUserId,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
  }

  // Motorcycles and their QR credentials.
  for (const row of valid('motorcycles')) {
    const data = rowData(row, 'motorcycles')!
    const inserted = await insertOne(tx, motorcycles, {
      id: row.targetId,
      assetCode: data.assetCode,
      model: data.model,
      plate: data.plate ?? null,
      status: data.status,
      location: data.location ?? null,
      nextAction: data.nextAction ?? null,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
    if (!inserted) continue

    if (data.location) {
      await insertOne(tx, locationAssignments, {
        id: deterministicLegacyId('location_assignments', data.sourceId),
        motorcycleId: row.targetId,
        location: data.location,
        note: 'Legacy import',
        assignedByUserId: createdByUserId,
        startedAt: new Date(),
      })
    }

    const [identity] = await tx.insert(qrIdentities).values({ motorcycleId: row.targetId }).returning()
    if (!identity) throw new Error(`Could not create QR identity for ${data.assetCode}`)
    const credentials = await uniqueQrCredentials(tx)
    await tx.insert(qrPayloads).values({
      identityId: identity.id,
      tokenHash: credentials.tokenHash,
      tokenCiphertext: credentials.tokenCiphertext,
      manualCode: credentials.manualCode,
      status: 'active',
      version: 1,
    })
  }

  // Agreements, items, and the initial immutable version snapshot.
  for (const row of valid('agreements')) {
    const data = rowData(row, 'agreements')!
    const clientRow = rows.find((candidate) => candidate.table === 'clients' && candidate.sourceId === data.clientSourceId)
    const inserted = await insertOne(tx, rentalAgreements, {
      id: row.targetId,
      clientId: clientRow?.targetId ?? deterministicLegacyId('clients', data.clientSourceId),
      status: data.status,
      version: 1,
      startDate: iso(data.startDate),
      endDate: iso(data.endDate),
      notes: data.notes ?? null,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
  }

  for (const row of valid('rentalItems')) {
    const data = rowData(row, 'rentalItems')!
    const agreementRow = rows.find((candidate) => candidate.table === 'agreements' && candidate.sourceId === data.agreementSourceId)
    const motorcycleRow = rows.find((candidate) => candidate.table === 'motorcycles' && candidate.sourceId === data.motorcycleSourceId)
    const inserted = await insertOne(tx, rentalItems, {
      id: row.targetId,
      agreementId: agreementRow?.targetId ?? deterministicLegacyId('agreements', data.agreementSourceId),
      motorcycleId: motorcycleRow?.targetId ?? deterministicLegacyId('motorcycles', data.motorcycleSourceId),
      startDate: iso(data.startDate)!,
      endDate: iso(data.endDate)!,
      dailyRateMinor: data.dailyRateMinor,
      currency: data.currency,
      status: data.status,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
  }

  for (const row of byTable('agreements')) {
    if (!['valid', 'duplicate', 'imported'].includes(row.status)) continue
    const data = rowData(row, 'agreements')!
    const itemRows = rows.filter((candidate) => candidate.table === 'rentalItems'
      && ['valid', 'duplicate', 'imported'].includes(candidate.status)
      && (candidate.data as ParsedRentalItem | null)?.agreementSourceId === data.sourceId)
    const snapshot = {
      agreement: {
        id: row.targetId,
        clientId: rows.find((candidate) => candidate.table === 'clients' && candidate.sourceId === data.clientSourceId)?.targetId ?? deterministicLegacyId('clients', data.clientSourceId),
        status: data.status,
        startDate: iso(data.startDate)?.toISOString() ?? null,
        endDate: iso(data.endDate)?.toISOString() ?? null,
        notes: data.notes ?? null,
      },
      items: itemRows.map((itemRow) => {
        const item = itemRow.data as ParsedRentalItem
        return {
          id: itemRow.targetId,
          motorcycleId: rows.find((candidate) => candidate.table === 'motorcycles' && candidate.sourceId === item.motorcycleSourceId)?.targetId ?? deterministicLegacyId('motorcycles', item.motorcycleSourceId),
          startDate: iso(item.startDate)!.toISOString(),
          endDate: iso(item.endDate)!.toISOString(),
          dailyRateMinor: item.dailyRateMinor,
          currency: item.currency,
          status: item.status,
        }
      }),
    }
    await tx.insert(rentalAgreementVersions).values({
      agreementId: row.targetId,
      version: 1,
      status: data.status,
      changeReason: 'imported',
      startDate: iso(data.startDate),
      endDate: iso(data.endDate),
      notes: data.notes ?? null,
      snapshot,
      createdByUserId,
    }).onConflictDoNothing()
  }

  for (const row of valid('obligations')) {
    const data = rowData(row, 'obligations')!
    const clientRow = data.clientSourceId
      ? rows.find((candidate) => candidate.table === 'clients' && candidate.sourceId === data.clientSourceId)
      : undefined
    const agreementRow = data.agreementSourceId
      ? rows.find((candidate) => candidate.table === 'agreements' && candidate.sourceId === data.agreementSourceId)
      : undefined
    const itemRow = data.rentalItemSourceId
      ? rows.find((candidate) => candidate.table === 'rentalItems' && candidate.sourceId === data.rentalItemSourceId)
      : undefined
    const inserted = await insertOne(tx, obligations, {
      id: row.targetId,
      clientId: clientRow?.targetId ?? (data.clientSourceId ? deterministicLegacyId('clients', data.clientSourceId) : null),
      agreementId: agreementRow?.targetId ?? (data.agreementSourceId ? deterministicLegacyId('agreements', data.agreementSourceId) : null),
      rentalItemId: itemRow?.targetId ?? (data.rentalItemSourceId ? deterministicLegacyId('rentalItems', data.rentalItemSourceId) : null),
      type: data.type,
      amountMinor: data.amountMinor,
      currency: data.currency,
      dueDate: iso(data.dueDate),
      notes: data.notes ?? null,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
  }

  for (const row of valid('receipts')) {
    const data = rowData(row, 'receipts')!
    const clientRow = data.clientSourceId
      ? rows.find((candidate) => candidate.table === 'clients' && candidate.sourceId === data.clientSourceId)
      : undefined
    const inserted = await insertOne(tx, receipts, {
      id: row.targetId,
      clientId: clientRow?.targetId ?? (data.clientSourceId ? deterministicLegacyId('clients', data.clientSourceId) : null),
      amountMinor: data.amountMinor,
      currency: data.currency,
      method: data.method,
      receivedAt: iso(data.receivedAt) ?? new Date(),
      notes: data.notes ?? null,
    })
    await mark(row, Boolean(inserted))
    if (!inserted) continue
    for (const [index, allocation] of data.allocations.entries()) {
      const obligationRow = rows.find((candidate) => candidate.table === 'obligations' && candidate.sourceId === allocation.obligationSourceId)
      await tx.insert(allocations).values({
        id: deterministicLegacyId('allocations', `${data.sourceId}:${index}`),
        receiptId: row.targetId,
        obligationId: obligationRow?.targetId ?? deterministicLegacyId('obligations', allocation.obligationSourceId),
        amountMinor: allocation.amountMinor,
      }).onConflictDoNothing()
    }
  }

  for (const row of valid('deposits')) {
    const data = rowData(row, 'deposits')!
    const clientRow = rows.find((candidate) => candidate.table === 'clients' && candidate.sourceId === data.clientSourceId)
    const agreementRow = data.agreementSourceId
      ? rows.find((candidate) => candidate.table === 'agreements' && candidate.sourceId === data.agreementSourceId)
      : undefined
    const custodyRow = data.documentCustodySourceId
      ? rows.find((candidate) => candidate.table === 'documentCustodies' && candidate.sourceId === data.documentCustodySourceId)
      : undefined
    const appliedRow = data.appliedObligationSourceId
      ? rows.find((candidate) => candidate.table === 'obligations' && candidate.sourceId === data.appliedObligationSourceId)
      : undefined
    const inserted = await insertOne(tx, deposits, {
      id: row.targetId,
      clientId: clientRow?.targetId ?? deterministicLegacyId('clients', data.clientSourceId),
      agreementId: agreementRow?.targetId ?? (data.agreementSourceId ? deterministicLegacyId('agreements', data.agreementSourceId) : null),
      type: data.type,
      status: data.status,
      amountMinor: data.amountMinor ?? null,
      currency: data.currency,
      documentCustodyId: custodyRow?.targetId ?? (data.documentCustodySourceId ? deterministicLegacyId('documentCustodies', data.documentCustodySourceId) : null),
      receivedAt: iso(data.receivedAt) ?? new Date(),
      returnedAt: iso(data.returnedAt),
      appliedObligationId: appliedRow?.targetId ?? (data.appliedObligationSourceId ? deterministicLegacyId('obligations', data.appliedObligationSourceId) : null),
      notes: data.notes ?? null,
      updatedAt: new Date(),
    })
    await mark(row, Boolean(inserted))
    if (!inserted) continue
    for (const [index, disposition] of data.dispositions.entries()) {
      const obligationRow = disposition.obligationSourceId
        ? rows.find((candidate) => candidate.table === 'obligations' && candidate.sourceId === disposition.obligationSourceId)
        : undefined
      await insertOne(tx, depositDispositions, {
        id: deterministicLegacyId('deposit_dispositions', `${data.sourceId}:${index}`),
        depositId: row.targetId,
        obligationId: obligationRow?.targetId ?? (disposition.obligationSourceId ? deterministicLegacyId('obligations', disposition.obligationSourceId) : null),
        type: disposition.type,
        amountMinor: disposition.amountMinor,
      })
    }
  }

  const duplicateRows = rows.filter((row) => row.status === 'duplicate').length

  await tx.update(legacyImportBatches).set({
    status: 'applied',
    importedRowCount: imported,
    duplicateRowCount: duplicateRows,
    appliedAt: new Date(),
  }).where(eq(legacyImportBatches.id, batchId))

  await tx.insert(auditEvents).values({
    actorUserId: createdByUserId,
    action: 'legacy_import.applied',
    entityType: 'legacy_import_batch',
    entityId: batchId,
    metadata: { imported, duplicateCount: duplicateRows, rows: rows.length },
  })

  return { imported, duplicateCount: duplicateRows }
}

export async function runLegacyImport(
  input: unknown,
  options: { apply?: boolean, label?: string | null, createdByUserId?: string | null } = {},
): Promise<LegacyImportResult> {
  const parsed = snapshotSchema.safeParse(input)
  if (!parsed.success) {
    throw new LegacyImportInputError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'snapshot'}: ${issue.message}`).join('; '))
  }

  const rawRows: RawRow[] = []
  for (const table of IMPORT_TABLES) {
    const rows = parsed.data[table]
    for (const [index, raw] of rows.entries()) {
      const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : { value: raw }
      const sourceId = typeof object.sourceId === 'string' && object.sourceId.trim()
        ? object.sourceId.trim()
        : `row-${index + 1}`
      rawRows.push({
        table,
        sourceId,
        payload: object,
        sourceHash: legacySourceHash(raw),
      })
    }
  }
  if (!rawRows.length) throw new LegacyImportInputError('Snapshot contains no importable rows')

  const prepared: PreparedRow[] = rawRows.map((row) => {
    const result = schemas[row.table].safeParse(row.payload)
    const errors = result.success
      ? []
      : result.error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`)
    if (row.sourceId.startsWith('row-') && !row.payload.sourceId) errors.push('sourceId: is required')
    return {
      ...row,
      stagingId: randomUUID(),
      data: result.success ? result.data as ParsedByTable[ImportTable] : null,
      status: errors.length ? 'invalid' : 'valid',
      errors,
      targetId: deterministicLegacyId(TARGET_ENTITY[row.table], row.sourceId),
      targetEntityType: TARGET_ENTITY[row.table],
    }
  })

  const rowBySource = new Map<string, PreparedRow>()
  for (const row of prepared) {
    const key = `${row.table}:${row.sourceId}`
    if (rowBySource.has(key)) {
      addError(row, `sourceId: duplicate "${row.sourceId}" in ${row.table}`)
      continue
    }
    rowBySource.set(key, row)
  }

  const reference = (table: ImportTable, sourceId: string | null | undefined) => {
    if (!sourceId) return null
    return rowBySource.get(`${table}:${sourceId}`) ?? null
  }

  for (const row of prepared) {
    if (!row.data || row.status === 'invalid') continue
    if (row.table === 'clients') {
      const data = row.data as ParsedClient
      const contacts = new Set<string>()
      for (const contact of data.contacts) {
        const key = `${contact.channel}\u0000${contact.value}`
        if (contacts.has(key)) addError(row, `contacts: duplicate ${contact.channel} contact`)
        contacts.add(key)
      }
    }
    if (row.table === 'agreements') {
      const data = row.data as ParsedAgreement
      if (!reference('clients', data.clientSourceId)) addError(row, `clientSourceId: unknown client "${data.clientSourceId}"`)
      if (data.startDate && data.endDate && new Date(data.endDate) < new Date(data.startDate)) addError(row, 'endDate: must be on or after startDate')
    }
    if (row.table === 'rentalItems') {
      const data = row.data as ParsedRentalItem
      if (!reference('agreements', data.agreementSourceId)) addError(row, `agreementSourceId: unknown agreement "${data.agreementSourceId}"`)
      if (!reference('motorcycles', data.motorcycleSourceId)) addError(row, `motorcycleSourceId: unknown motorcycle "${data.motorcycleSourceId}"`)
      if (new Date(data.endDate) < new Date(data.startDate)) addError(row, 'endDate: must be on or after startDate')
    }
    if (row.table === 'obligations') {
      const data = row.data as ParsedObligation
      if (data.clientSourceId && !reference('clients', data.clientSourceId)) addError(row, `clientSourceId: unknown client "${data.clientSourceId}"`)
      if (data.agreementSourceId && !reference('agreements', data.agreementSourceId)) addError(row, `agreementSourceId: unknown agreement "${data.agreementSourceId}"`)
      if (data.rentalItemSourceId && !reference('rentalItems', data.rentalItemSourceId)) addError(row, `rentalItemSourceId: unknown rental item "${data.rentalItemSourceId}"`)
    }
    if (row.table === 'receipts') {
      const data = row.data as ParsedReceipt
      if (data.clientSourceId && !reference('clients', data.clientSourceId)) addError(row, `clientSourceId: unknown client "${data.clientSourceId}"`)
      let allocated = 0
      const allocatedObligations = new Set<string>()
      for (const allocation of data.allocations) {
        allocated += allocation.amountMinor
        if (allocatedObligations.has(allocation.obligationSourceId)) addError(row, `allocations: duplicate obligation "${allocation.obligationSourceId}"`)
        allocatedObligations.add(allocation.obligationSourceId)
        const obligationRow = reference('obligations', allocation.obligationSourceId)
        if (!obligationRow) {
          addError(row, `allocations: unknown obligation "${allocation.obligationSourceId}"`)
          continue
        }
        const obligation = obligationRow.data as ParsedObligation | null
        if (obligation && obligation.currency !== data.currency) addError(row, `allocations: currency ${obligation.currency} does not match receipt ${data.currency}`)
      }
      if (allocated > data.amountMinor) addError(row, 'allocations: total exceeds receipt amount')
    }
    if (row.table === 'deposits') {
      const data = row.data as ParsedDeposit
      if (!reference('clients', data.clientSourceId)) addError(row, `clientSourceId: unknown client "${data.clientSourceId}"`)
      if (data.agreementSourceId && !reference('agreements', data.agreementSourceId)) addError(row, `agreementSourceId: unknown agreement "${data.agreementSourceId}"`)
      if (data.documentCustodySourceId && !reference('documentCustodies', data.documentCustodySourceId)) addError(row, `documentCustodySourceId: unknown document custody "${data.documentCustodySourceId}"`)
      if (data.appliedObligationSourceId && !reference('obligations', data.appliedObligationSourceId)) addError(row, `appliedObligationSourceId: unknown obligation "${data.appliedObligationSourceId}"`)
      if (data.type === 'cash' && (data.amountMinor == null || data.amountMinor <= 0)) addError(row, 'amountMinor: cash deposit must be positive')
      if (data.type === 'document_custody' && !data.documentCustodySourceId) addError(row, 'documentCustodySourceId: required for document custody deposit')
      if (data.status === 'applied' && data.type !== 'cash') addError(row, 'type: only cash deposits can be applied')
      if (data.status === 'applied' && !data.appliedObligationSourceId) addError(row, 'appliedObligationSourceId: required when status is applied')
      if (data.status === 'returned' && !data.returnedAt) addError(row, 'returnedAt: required when status is returned')
      if (data.type === 'document_custody' && data.dispositions.length) addError(row, 'dispositions: document custody deposits cannot be disposed as cash')
      if (data.status === 'held' && data.dispositions.length) addError(row, 'dispositions: only allowed when status is applied or returned')
      if (data.type === 'cash' && data.status !== 'held' && !data.dispositions.length) addError(row, 'dispositions: required for a closed cash deposit')
      let disposed = 0
      for (const disposition of data.dispositions) {
        disposed += disposition.amountMinor
        if (disposition.type === 'applied' && !disposition.obligationSourceId) addError(row, 'dispositions: applied disposition requires obligationSourceId')
        if (disposition.type === 'applied' && disposition.obligationSourceId && !reference('obligations', disposition.obligationSourceId)) addError(row, `dispositions: unknown obligation "${disposition.obligationSourceId}"`)
        if (disposition.type === 'returned' && disposition.obligationSourceId) addError(row, 'dispositions: returned disposition must not reference an obligation')
      }
      if (data.amountMinor != null && disposed > data.amountMinor) addError(row, 'dispositions: total exceeds deposit amount')
    }
    if (row.table === 'documentCustodies') {
      const data = row.data as ParsedDocumentCustody
      if (!reference('clients', data.clientSourceId)) addError(row, `clientSourceId: unknown client "${data.clientSourceId}"`)
      if (data.status === 'returned' && !data.returnedAt) addError(row, 'returnedAt: required when status is returned')
    }
  }

  // The SQL trigger also enforces this, but detecting it here keeps the whole
  // batch report useful instead of failing on the first insert.
  const allocatedByObligation = new Map<string, number>()
  for (const row of prepared) {
    if (row.table !== 'receipts' || row.status === 'invalid' || !row.data) continue
    for (const allocation of (row.data as ParsedReceipt).allocations) {
      allocatedByObligation.set(
        allocation.obligationSourceId,
        (allocatedByObligation.get(allocation.obligationSourceId) ?? 0) + allocation.amountMinor,
      )
    }
  }
  for (const row of prepared) {
    if (row.table !== 'receipts' || row.status === 'invalid' || !row.data) continue
    for (const allocation of (row.data as ParsedReceipt).allocations) {
      const obligationRow = reference('obligations', allocation.obligationSourceId)
      const obligation = obligationRow?.data as ParsedObligation | null | undefined
      if (obligation && (allocatedByObligation.get(allocation.obligationSourceId) ?? 0) > obligation.amountMinor) {
        addError(row, `allocations: total for obligation "${allocation.obligationSourceId}" exceeds its amount`)
      }
    }
  }

  // Reject references to rows that are themselves invalid. Iterate to a fixed
  // point because the source order is not guaranteed to match dependency order
  // (deposits reference documentCustodies, which are listed last in the schema).
  let propagationChanged = true
  for (let pass = 0; propagationChanged && pass < 10; pass += 1) {
    propagationChanged = false
    for (const row of prepared) {
      if (!row.data || row.status === 'invalid') continue
      const references: Array<[ImportTable, string | null | undefined]> = []
      if (row.table === 'agreements') {
        const data = row.data as ParsedAgreement
        references.push(['clients', data.clientSourceId])
      }
      if (row.table === 'rentalItems') {
        const data = row.data as ParsedRentalItem
        references.push(['agreements', data.agreementSourceId], ['motorcycles', data.motorcycleSourceId])
      }
      if (row.table === 'obligations') {
        const data = row.data as ParsedObligation
        references.push(['clients', data.clientSourceId], ['agreements', data.agreementSourceId], ['rentalItems', data.rentalItemSourceId])
      }
      if (row.table === 'receipts') {
        const data = row.data as ParsedReceipt
        references.push(['clients', data.clientSourceId])
        for (const allocation of data.allocations) references.push(['obligations', allocation.obligationSourceId])
      }
      if (row.table === 'deposits') {
        const data = row.data as ParsedDeposit
        references.push(['clients', data.clientSourceId], ['agreements', data.agreementSourceId], ['documentCustodies', data.documentCustodySourceId], ['obligations', data.appliedObligationSourceId])
        for (const disposition of data.dispositions) references.push(['obligations', disposition.obligationSourceId])
      }
      if (row.table === 'documentCustodies') {
        const data = row.data as ParsedDocumentCustody
        references.push(['clients', data.clientSourceId])
      }
      for (const [table, sourceId] of references) {
        if (!sourceId) continue
        const referenced = reference(table, sourceId)
        if (referenced?.status === 'invalid') {
          const before = row.errors.length
          addError(row, `${table}: referenced row "${sourceId}" is invalid`)
          if (row.errors.length > before) propagationChanged = true
        }
      }
    }
  }

  const db = await getDb()
  const checksum = legacySourceHash(input)
  const [batch] = await db.insert(legacyImportBatches).values({
    label: options.label?.trim() || null,
    status: 'dry_run',
    sourceChecksum: checksum,
    sourceRowCount: prepared.length,
    createdByUserId: options.createdByUserId ?? null,
  }).returning()
  if (!batch) throw new Error('Could not create legacy import batch')

  // Detect target-id collisions and asset-code collisions before staging.
  const idChecks: Array<[ImportTable, any]> = [
    ['clients', clients],
    ['motorcycles', motorcycles],
    ['agreements', rentalAgreements],
    ['rentalItems', rentalItems],
    ['obligations', obligations],
    ['receipts', receipts],
    ['deposits', deposits],
    ['documentCustodies', documentCustodies],
  ]
  for (const [table, target] of idChecks) {
    const rows = prepared.filter((row) => row.table === table && row.status !== 'invalid')
    const existing = await existingIds(db, target, rows.map((row) => row.targetId))
    for (const row of rows) {
      if (existing.has(row.targetId)) row.status = 'duplicate'
    }
  }

  const motorcycleRows = prepared.filter((row) => row.table === 'motorcycles' && row.data && row.status !== 'invalid')
  if (motorcycleRows.length) {
    const codes = motorcycleRows.map((row) => (row.data as ParsedMotorcycle).assetCode)
    const existing = await db.select({ id: motorcycles.id, assetCode: motorcycles.assetCode }).from(motorcycles).where(inArray(motorcycles.assetCode, codes))
    const codeToId = new Map(existing.map((row) => [row.assetCode, row.id]))
    for (const row of motorcycleRows) {
      const data = row.data as ParsedMotorcycle
      const existingId = codeToId.get(data.assetCode)
      if (existingId && existingId !== row.targetId) addError(row, `assetCode: "${data.assetCode}" already belongs to another motorcycle`)
    }
  }

  for (const row of prepared) {
    if (row.errors.length && row.status !== 'duplicate') row.status = 'invalid'
  }

  const report = buildReport(options.apply ? 'apply' : 'dry-run', prepared)
  const counts = {
    ...Object.fromEntries(IMPORT_TABLES.map((table) => [table, report.tables[table]])),
    total: prepared.length,
  } as LegacyImportTableReport & { total: number }

  await db.update(legacyImportBatches).set({
    validRowCount: prepared.filter((row) => row.status === 'valid').length,
    invalidRowCount: prepared.filter((row) => row.status === 'invalid').length,
    duplicateRowCount: prepared.filter((row) => row.status === 'duplicate').length,
    report,
  }).where(eq(legacyImportBatches.id, batch.id))

  try {
    for (let offset = 0; offset < prepared.length; offset += 500) {
      const chunk = prepared.slice(offset, offset + 500)
      await db.insert(legacyImportRows).values(chunk.map((row) => ({
        id: row.stagingId,
        batchId: batch.id,
        sourceTable: row.table,
        sourceId: row.sourceId,
        sourceHash: row.sourceHash,
        payload: row.payload,
        status: row.status,
        targetEntityType: row.targetEntityType,
        targetEntityId: row.targetId,
        errors: row.errors,
        updatedAt: new Date(),
      })))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown staging error'
    await db.update(legacyImportBatches).set({
      status: 'failed',
      report: { ...report, issues: [...report.issues, { sourceTable: 'clients', sourceId: 'batch', errors: [message] }] },
    }).where(eq(legacyImportBatches.id, batch.id))
    await db.insert(auditEvents).values({
      actorUserId: options.createdByUserId ?? null,
      action: 'legacy_import.failed',
      entityType: 'legacy_import_batch',
      entityId: batch.id,
      metadata: { counts, checksum, stage: 'staging', error: message },
    })
    throw error
  }

  if (!options.apply) {
    await db.insert(auditEvents).values({
      actorUserId: options.createdByUserId ?? null,
      action: 'legacy_import.dry_run',
      entityType: 'legacy_import_batch',
      entityId: batch.id,
      metadata: { counts, checksum },
    })
    return { batchId: batch.id, status: 'dry_run', report, counts }
  }

  if (prepared.some((row) => row.status === 'invalid')) {
    await db.update(legacyImportBatches).set({
      status: 'failed',
      report: { ...report, issues: report.issues },
    }).where(eq(legacyImportBatches.id, batch.id))
    await db.insert(auditEvents).values({
      actorUserId: options.createdByUserId ?? null,
      action: 'legacy_import.failed',
      entityType: 'legacy_import_batch',
      entityId: batch.id,
      metadata: { counts, checksum, issues: report.issues.length, stage: 'validation' },
    })
    throw new LegacyImportValidationError(batch.id, report)
  }

  try {
    const applied = await db.transaction(async (tx) => {
      const result = await applyRows(tx, prepared, options.createdByUserId ?? null, batch.id)
      const appliedReport = buildReport('apply', prepared)
      await tx.update(legacyImportBatches).set({
        status: 'applied',
        validRowCount: prepared.filter((row) => row.status === 'valid' || row.status === 'imported').length,
        duplicateRowCount: prepared.filter((row) => row.status === 'duplicate').length,
        importedRowCount: result.imported,
        report: appliedReport,
      }).where(eq(legacyImportBatches.id, batch.id))
      return { result, appliedReport }
    })

    return {
      batchId: batch.id,
      status: 'applied',
      report: applied.appliedReport,
      counts: {
        ...Object.fromEntries(IMPORT_TABLES.map((table) => [table, applied.appliedReport.tables[table]])),
        total: prepared.length,
      } as LegacyImportTableReport & { total: number },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown import error'
    await db.update(legacyImportBatches).set({
      status: 'failed',
      report: { ...report, issues: [...report.issues, { sourceTable: 'clients', sourceId: 'batch', errors: [message] }] },
    }).where(eq(legacyImportBatches.id, batch.id))
    await db.insert(auditEvents).values({
      actorUserId: options.createdByUserId ?? null,
      action: 'legacy_import.failed',
      entityType: 'legacy_import_batch',
      entityId: batch.id,
      metadata: { counts, checksum, issues: report.issues.length, stage: 'apply', error: message },
    })
    throw error
  }
}
