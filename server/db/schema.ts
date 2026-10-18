import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
// Tenant-owned entities retain their original IDs for repeatable Convex imports.
export const entities = pgTable(
  'entities',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    kind: text('kind').notNull(),
    parentId: text('parent_id'),
    data: jsonb('data').$type<Record<string, any>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('entities_owner_kind').on(t.ownerId, t.kind),
    index('entities_parent').on(t.parentId),
  ],
)
export const files = pgTable('files', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  sessionId: text('session_id'),
  provider: text('provider').notNull(),
  bucket: text('bucket'),
  objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})
export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    entityId: text('entity_id').notNull(),
    kind: text('kind').notNull(),
    status: text('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    payload: jsonb('payload').$type<Record<string, any>>().notNull(),
    lastError: text('last_error'),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('jobs_dispatch').on(t.status, t.availableAt)],
)
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('api_keys_hash').on(t.hash)],
)
