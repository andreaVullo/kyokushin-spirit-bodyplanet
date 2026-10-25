import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const arcadeRecords = sqliteTable('arcade_records', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  recordJson: text('record_json').notNull(),
  receivedAt: integer('received_at').notNull(),
}, table => [index('arcade_records_received_at_id_idx').on(table.receivedAt, table.id)]);
export const rateBuckets = sqliteTable('rate_buckets', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
