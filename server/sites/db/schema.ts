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

export const onlineRooms = sqliteTable('online_rooms', {
  code: text('code').primaryKey(),
  mode: text('mode').notNull(),
  public: integer('public').notNull(),
  protocol: integer('protocol').notNull(),
  status: text('status').notNull(),
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  hostToken: text('host_token').notNull(),
  hostName: text('host_name').notNull(),
  hostFighter: text('host_fighter').notNull(),
  hostReady: integer('host_ready').notNull(),
  hostSeen: integer('host_seen').notNull(),
  hostPoll: integer('host_poll').notNull(),
  guestToken: text('guest_token'),
  guestName: text('guest_name'),
  guestFighter: text('guest_fighter'),
  guestReady: integer('guest_ready').notNull(),
  guestSeen: integer('guest_seen'),
  guestPoll: integer('guest_poll').notNull(),
}, table => [index('online_rooms_match_idx').on(table.public, table.mode, table.status, table.createdAt),
  index('online_rooms_expiry_idx').on(table.expiresAt)]);

export const onlineSignals = sqliteTable('online_signals', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  roomCode: text('room_code').notNull().references(() => onlineRooms.code, { onDelete: 'cascade' }),
  sender: integer('sender').notNull(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('online_signals_room_seq_idx').on(table.roomCode, table.seq)]);
