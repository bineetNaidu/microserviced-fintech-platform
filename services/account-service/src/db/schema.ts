import { pgTable, varchar, uuid, char, timestamp, bigint, text, index } from 'drizzle-orm/pg-core';
import { relations, isNull } from 'drizzle-orm';

/**
 * Accounts Table Schema
 * Maps structural configurations, routing metadata, and legal status layers to accounts.
 * Balance is calculated dynamically from Ledger Service entries, not stored here.
 */
export const accounts = pgTable(
  'accounts',
  {
    /** Strict ULID representation (26-character alphanumeric string) */
    id: varchar('id', { length: 26 }).primaryKey(),
    /** Coordinated UUID cross-reference to user-service */
    userId: uuid('user_id').notNull(),
    /** Categorizes structural operational constraints */
    type: varchar('type', { length: 30 }).notNull(), // 'CHECKING', 'SAVINGS', 'SUSPENSE'
    /** Compliance lifecycle state */
    status: varchar('status', { length: 30 }).notNull().default('ACTIVE'), // 'ACTIVE', 'FROZEN', 'CLOSED'
    /** ISO 4217 Currency Parameter */
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Index user_id and currency for portfolio checking, ignoring soft-deleted rows
    index('idx_accounts_user_currency')
      .on(table.userId, table.currency)
      .where(isNull(table.deletedAt)),
    // Index status for fast authorization / compliance checks
    index('idx_accounts_status_verification').on(table.id, table.status),
  ],
);

/**
 * Account Limits Table Schema
 * Enforces daily velocity and single-transaction limit bounds in paise.
 */
export const accountLimits = pgTable('account_limits', {
  id: varchar('id', { length: 26 }).primaryKey(), // ULID
  accountId: varchar('account_id', { length: 26 })
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  dailyVelocityLimitPaise: bigint('daily_velocity_limit_paise', { mode: 'number' })
    .notNull()
    .default(50000000), // Default ₹5,00,000.00
  singleTransactionLimitPaise: bigint('single_transaction_limit_paise', { mode: 'number' })
    .notNull()
    .default(10000000), // Default ₹1,00,000.00
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Account Status History Table Schema
 * Immutable log tracking every administrative state change on accounts.
 */
export const accountStatusHistory = pgTable('account_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: varchar('account_id', { length: 26 })
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  previousStatus: varchar('previous_status', { length: 30 }).notNull(),
  newStatus: varchar('new_status', { length: 30 }).notNull(),
  changedBy: varchar('changed_by', { length: 255 }).notNull(), // UUID or 'SYSTEM'
  changedByRole: varchar('changed_by_role', { length: 50 }).notNull(), // e.g. 'OPERATIONS', 'SYSTEM'
  reason: text('reason').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Inbox Messages Table Schema
 * Handles idempotent AMQP consumer registrations to prevent duplicate processing of event envelopes.
 */
export const inboxMessages = pgTable('inbox_messages', {
  id: varchar('id', { length: 26 }).primaryKey(), // Event ID from envelope (ULID)
  eventType: varchar('event_type', { length: 255 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── RELATIONSHIPS ───────────────────────────────────────────────────────────

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  limits: one(accountLimits, {
    fields: [accounts.id],
    references: [accountLimits.accountId],
  }),
  statusHistory: many(accountStatusHistory),
}));

export const accountLimitsRelations = relations(accountLimits, ({ one }) => ({
  account: one(accounts, {
    fields: [accountLimits.accountId],
    references: [accounts.id],
  }),
}));

export const accountStatusHistoryRelations = relations(accountStatusHistory, ({ one }) => ({
  account: one(accounts, {
    fields: [accountStatusHistory.accountId],
    references: [accounts.id],
  }),
}));
