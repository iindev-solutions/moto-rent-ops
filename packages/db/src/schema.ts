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
