import { sql } from 'drizzle-orm'
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('operator'),
  locationScope: jsonb('location_scope').$type<string[]>().notNull().default(['*']),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_uidx').on(table.email),
  index('users_active_idx').on(table.active),
])

export const motorcycles = pgTable('motorcycles', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetCode: varchar('asset_code', { length: 32 }).notNull(),
  model: varchar('model', { length: 120 }).notNull(),
  plate: varchar('plate', { length: 32 }),
  status: varchar('status', { length: 32 }).notNull().default('available'),
  location: varchar('location', { length: 120 }),
  nextAction: varchar('next_action', { length: 240 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('motorcycles_asset_code_uidx').on(table.assetCode),
  index('motorcycles_status_idx').on(table.status),
])

export const qrIdentities = pgTable('qr_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  motorcycleId: uuid('motorcycle_id').notNull().references(() => motorcycles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('qr_identities_motorcycle_uidx').on(table.motorcycleId),
])

export const qrPayloads = pgTable('qr_payloads', {
  id: uuid('id').defaultRandom().primaryKey(),
  identityId: uuid('identity_id').notNull().references(() => qrIdentities.id),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  tokenCiphertext: text('token_ciphertext').notNull(),
  manualCode: varchar('manual_code', { length: 16 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('qr_payloads_token_hash_uidx').on(table.tokenHash),
  uniqueIndex('qr_payloads_manual_code_uidx').on(table.manualCode),
  uniqueIndex('qr_payloads_active_identity_uidx').on(table.identityId).where(sql`status = 'active'`),
  index('qr_payloads_identity_status_idx').on(table.identityId, table.status),
])

export const locationAssignments = pgTable('location_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  motorcycleId: uuid('motorcycle_id').notNull().references(() => motorcycles.id),
  location: varchar('location', { length: 120 }).notNull(),
  note: text('note'),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('location_assignments_motorcycle_idx').on(table.motorcycleId, table.startedAt),
  check('location_assignments_location_chk', sql`length(trim(${table.location})) > 0`),
  check('location_assignments_window_chk', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
])

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: varchar('action', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: uuid('entity_id'),
  location: varchar('location', { length: 120 }),
  reason: text('reason'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_events_entity_idx').on(table.entityType, table.entityId),
  index('audit_events_actor_idx').on(table.actorUserId),
  index('audit_events_created_idx').on(table.createdAt),
])

export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  displayName: varchar('display_name', { length: 160 }).notNull(),
  preferredChannel: varchar('preferred_channel', { length: 32 }).notNull().default('phone'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('clients_name_idx').on(table.displayName),
])

export const clientContacts = pgTable('client_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  channel: varchar('channel', { length: 32 }).notNull(),
  value: varchar('value', { length: 240 }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('client_contacts_client_channel_value_uidx').on(table.clientId, table.channel, table.value),
  index('client_contacts_client_idx').on(table.clientId),
])

export const documentCustodies = pgTable('document_custodies', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  documentType: varchar('document_type', { length: 64 }).notNull(),
  maskedNumber: varchar('masked_number', { length: 64 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: varchar('status', { length: 16 }).notNull().default('held'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  receivedByUserId: uuid('received_by_user_id').references(() => users.id),
  returnedByUserId: uuid('returned_by_user_id').references(() => users.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('document_custodies_client_idx').on(table.clientId),
  index('document_custodies_status_idx').on(table.status),
])

export const rentalAgreements = pgTable('rental_agreements', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('rental_agreements_client_idx').on(table.clientId),
  index('rental_agreements_status_idx').on(table.status),
  check('rental_agreements_dates_chk', sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
])

export const rentalItems = pgTable('rental_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  agreementId: uuid('agreement_id').notNull().references(() => rentalAgreements.id),
  motorcycleId: uuid('motorcycle_id').notNull().references(() => motorcycles.id),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  dailyRateMinor: bigint('daily_rate_minor', { mode: 'number' }).notNull().default(0),
  currency: varchar('currency', { length: 8 }).notNull().default('VND'),
  status: varchar('status', { length: 32 }).notNull().default('planned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('rental_items_agreement_idx').on(table.agreementId),
  index('rental_items_motorcycle_idx').on(table.motorcycleId),
  check('rental_items_dates_chk', sql`${table.endDate} >= ${table.startDate}`),
  check('rental_items_daily_rate_chk', sql`${table.dailyRateMinor} > 0`),
  check('rental_items_currency_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
])

export type AgreementVersionSnapshot = {
  agreement: {
    id: string
    clientId: string
    status: string
    startDate: string | null
    endDate: string | null
    notes: string | null
  }
  items: Array<{
    id: string
    motorcycleId: string
    startDate: string
    endDate: string
    dailyRateMinor: number
    currency: string
    status: string
  }>
}

// Insert-only history: every material change of an agreement appends one immutable row.
// Rows are never updated or deleted; `version` matches rental_agreements.version at that moment.
export const rentalAgreementVersions = pgTable('rental_agreement_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  agreementId: uuid('agreement_id').notNull().references(() => rentalAgreements.id),
  version: integer('version').notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  changeReason: varchar('change_reason', { length: 32 }).notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  notes: text('notes'),
  snapshot: jsonb('snapshot').$type<AgreementVersionSnapshot>().notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('rental_agreement_versions_agreement_version_uidx').on(table.agreementId, table.version),
  index('rental_agreement_versions_agreement_idx').on(table.agreementId),
  check('rental_agreement_versions_version_chk', sql`${table.version} > 0`),
])

export const handovers = pgTable('handovers', {
  id: uuid('id').defaultRandom().primaryKey(),
  rentalItemId: uuid('rental_item_id').references(() => rentalItems.id),
  motorcycleId: uuid('motorcycle_id').notNull().references(() => motorcycles.id),
  performedByUserId: uuid('performed_by_user_id').references(() => users.id),
  odometer: integer('odometer'),
  fuelLevel: varchar('fuel_level', { length: 32 }),
  checklist: jsonb('checklist').$type<Record<string, unknown>>().notNull().default({}),
  damageNotes: text('damage_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('handovers_motorcycle_idx').on(table.motorcycleId),
  index('handovers_rental_item_idx').on(table.rentalItemId),
])

export const obligations = pgTable('obligations', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id),
  agreementId: uuid('agreement_id').references(() => rentalAgreements.id),
  rentalItemId: uuid('rental_item_id').references(() => rentalItems.id),
  type: varchar('type', { length: 32 }).notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('VND'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('obligations_client_idx').on(table.clientId),
  index('obligations_agreement_idx').on(table.agreementId),
  check('obligations_amount_chk', sql`${table.amountMinor} > 0`),
  check('obligations_currency_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
])

export const receipts = pgTable('receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('VND'),
  method: varchar('method', { length: 32 }).notNull().default('cash'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('receipts_client_idx').on(table.clientId),
  check('receipts_amount_chk', sql`${table.amountMinor} > 0`),
  check('receipts_currency_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
])

export const allocations = pgTable('allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  receiptId: uuid('receipt_id').notNull().references(() => receipts.id),
  obligationId: uuid('obligation_id').notNull().references(() => obligations.id),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('allocations_receipt_idx').on(table.receiptId),
  index('allocations_obligation_idx').on(table.obligationId),
  check('allocations_amount_chk', sql`${table.amountMinor} > 0`),
])

export const deposits = pgTable('deposits', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id),
  agreementId: uuid('agreement_id').references(() => rentalAgreements.id),
  type: varchar('type', { length: 32 }).notNull().default('cash'),
  status: varchar('status', { length: 16 }).notNull().default('held'),
  amountMinor: bigint('amount_minor', { mode: 'number' }),
  currency: varchar('currency', { length: 8 }).notNull().default('VND'),
  documentCustodyId: uuid('document_custody_id').references(() => documentCustodies.id),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  appliedObligationId: uuid('applied_obligation_id').references(() => obligations.id),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('deposits_client_idx').on(table.clientId),
  index('deposits_status_idx').on(table.status),
  check('deposits_amount_nonnegative_chk', sql`${table.amountMinor} IS NULL OR ${table.amountMinor} >= 0`),
  check('deposits_cash_amount_chk', sql`${table.type} <> 'cash' OR (${table.amountMinor} IS NOT NULL AND ${table.amountMinor} > 0)`),
  check('deposits_type_chk', sql`${table.type} IN ('cash', 'document_custody')`),
  check('deposits_status_chk', sql`${table.status} IN ('held', 'applied', 'returned')`),
  check('deposits_currency_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
])

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  scope: varchar('scope', { length: 80 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
  requestHash: varchar('request_hash', { length: 128 }).notNull(),
  response: jsonb('response').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('idempotency_scope_key_uidx').on(table.scope, table.idempotencyKey),
])

export const returnInspections = pgTable('return_inspections', {
  id: uuid('id').defaultRandom().primaryKey(),
  rentalItemId: uuid('rental_item_id').notNull().references(() => rentalItems.id),
  motorcycleId: uuid('motorcycle_id').notNull().references(() => motorcycles.id),
  performedByUserId: uuid('performed_by_user_id').references(() => users.id),
  odometer: integer('odometer'),
  fuelLevel: varchar('fuel_level', { length: 32 }),
  checklist: jsonb('checklist').$type<Record<string, unknown>>().notNull().default({}),
  damageNotes: text('damage_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('return_inspections_rental_item_idx').on(table.rentalItemId),
  index('return_inspections_motorcycle_idx').on(table.motorcycleId),
])

export const depositDispositions = pgTable('deposit_dispositions', {
  id: uuid('id').defaultRandom().primaryKey(),
  depositId: uuid('deposit_id').notNull().references(() => deposits.id),
  obligationId: uuid('obligation_id').references(() => obligations.id),
  type: varchar('type', { length: 16 }).notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('deposit_dispositions_deposit_idx').on(table.depositId),
  check('deposit_dispositions_amount_chk', sql`${table.amountMinor} > 0`),
  check('deposit_dispositions_type_chk', sql`${table.type} IN ('applied', 'returned')`),
])

export const incidents = pgTable('incidents', {
  id: uuid('id').defaultRandom().primaryKey(),
  motorcycleId: uuid('motorcycle_id').references(() => motorcycles.id),
  clientId: uuid('client_id').references(() => clients.id),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  priority: varchar('priority', { length: 16 }).notNull().default('medium'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('incidents_motorcycle_idx').on(table.motorcycleId),
  index('incidents_status_idx').on(table.status),
])

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: varchar('entity_type', { length: 40 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  storageKey: varchar('storage_key', { length: 240 }).notNull(),
  contentType: varchar('content_type', { length: 80 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('attachments_entity_idx').on(table.entityType, table.entityId),
])

export const maintenanceOrders = pgTable('maintenance_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  motorcycleId: uuid('motorcycle_id').notNull().references(() => motorcycles.id),
  type: varchar('type', { length: 64 }).notNull().default('service'),
  status: varchar('status', { length: 32 }).notNull().default('planned'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  costMinor: bigint('cost_minor', { mode: 'number' }).notNull().default(0),
  currency: varchar('currency', { length: 8 }).notNull().default('VND'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('maintenance_motorcycle_idx').on(table.motorcycleId),
  index('maintenance_status_idx').on(table.status),
  index('maintenance_due_idx').on(table.dueDate),
  check('maintenance_orders_cost_chk', sql`${table.costMinor} >= 0`),
  check('maintenance_orders_currency_chk', sql`${table.currency} ~ '^[A-Z]{3}$'`),
])

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  aggregateType: varchar('aggregate_type', { length: 60 }).notNull(),
  aggregateId: uuid('aggregate_id'),
  dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  replayEpoch: integer('replay_epoch').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('outbox_events_dedupe_key_uidx').on(table.dedupeKey),
  index('outbox_events_status_next_idx').on(table.status, table.nextAttemptAt),
  index('outbox_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
  index('outbox_events_created_idx').on(table.createdAt),
  check('outbox_events_status_chk', sql`${table.status} IN ('pending', 'processing', 'sent', 'dead_letter')`),
  check('outbox_events_attempts_chk', sql`${table.attempts} >= 0`),
  check('outbox_events_replay_epoch_chk', sql`${table.replayEpoch} >= 0`),
])

// Immutable delivery journal. One row per real send attempt; replay starts a new epoch.
export const outboxAttempts = pgTable('outbox_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => outboxEvents.id),
  epoch: integer('epoch').notNull().default(0),
  attempt: integer('attempt').notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  httpStatus: integer('http_status'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('outbox_attempts_event_epoch_attempt_uidx').on(table.eventId, table.epoch, table.attempt),
  index('outbox_attempts_event_idx').on(table.eventId, table.createdAt),
  check('outbox_attempts_status_chk', sql`${table.status} IN ('sent', 'failed')`),
  check('outbox_attempts_attempt_chk', sql`${table.attempt} > 0`),
  check('outbox_attempts_epoch_chk', sql`${table.epoch} >= 0`),
])

// Durable login throttling. Keys are SHA-256 hashes of normalized email + IP,
// so raw identifiers are not retained in this table.
export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  key: varchar('key', { length: 128 }).primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('rate_limit_buckets_reset_idx').on(table.resetAt),
  check('rate_limit_buckets_count_chk', sql`${table.count} >= 0`),
])

// Legacy migration staging. Batches record the dry-run/apply report; rows
// preserve the source table/id, raw payload, validation errors and target id.
export const legacyImportBatches = pgTable('legacy_import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: varchar('label', { length: 160 }),
  status: varchar('status', { length: 16 }).notNull().default('dry_run'),
  sourceChecksum: varchar('source_checksum', { length: 64 }).notNull(),
  sourceRowCount: integer('source_row_count').notNull().default(0),
  validRowCount: integer('valid_row_count').notNull().default(0),
  invalidRowCount: integer('invalid_row_count').notNull().default(0),
  duplicateRowCount: integer('duplicate_row_count').notNull().default(0),
  importedRowCount: integer('imported_row_count').notNull().default(0),
  report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
}, (table) => [
  index('legacy_import_batches_created_idx').on(table.createdAt),
  check('legacy_import_batches_status_chk', sql`${table.status} IN ('dry_run', 'applied', 'failed')`),
  check('legacy_import_batches_counts_chk', sql`${table.sourceRowCount} >= 0 AND ${table.validRowCount} >= 0 AND ${table.invalidRowCount} >= 0 AND ${table.duplicateRowCount} >= 0 AND ${table.importedRowCount} >= 0`),
])

export const legacyImportRows = pgTable('legacy_import_rows', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id').notNull().references(() => legacyImportBatches.id, { onDelete: 'cascade' }),
  sourceTable: varchar('source_table', { length: 40 }).notNull(),
  sourceId: varchar('source_id', { length: 120 }).notNull(),
  sourceHash: varchar('source_hash', { length: 64 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  targetEntityType: varchar('target_entity_type', { length: 40 }),
  targetEntityId: uuid('target_entity_id'),
  errors: jsonb('errors').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('legacy_import_rows_batch_source_idx').on(table.batchId, table.sourceTable, table.sourceId),
  index('legacy_import_rows_batch_idx').on(table.batchId),
  index('legacy_import_rows_target_idx').on(table.targetEntityType, table.targetEntityId),
  check('legacy_import_rows_status_chk', sql`${table.status} IN ('pending', 'valid', 'invalid', 'imported', 'duplicate', 'skipped')`),
])
