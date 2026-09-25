import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

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
  status: varchar('status', { length: 16 }).notNull().default('active'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('qr_payloads_token_hash_uidx').on(table.tokenHash),
  index('qr_payloads_identity_status_idx').on(table.identityId, table.status),
])
