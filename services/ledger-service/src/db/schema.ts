import {
  pgTable,
  varchar,
  char,
  timestamp,
  bigint,
  date,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Ledger Transactions Table Schema.
 * Immutable transaction wrapper record.
 */
export const ledgerTransactions = pgTable('ledger_transactions', {
  /** ULID representation (26-character alphanumeric string) */
  id: varchar('id', { length: 26 }).primaryKey(),
  /** Unique reference connecting back to the Saga Orchestrator */
  referenceId: varchar('reference_id', { length: 26 }).notNull().unique(),
  /** Categorizes the business intent of the transaction */
  purpose: varchar('purpose', { length: 50 }).notNull(), // 'USER_TRANSFER', 'DEPOSIT', 'FEE', 'REVERSAL'
  /** ISO 4217 Currency Parameter */
  currency: char('currency', { length: 3 }).notNull(), // 'INR', 'USD', 'EUR'
  /** Definitive, unalterable execution timestamp */
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ledger Entries Table Schema.
 * Individual debit or credit line item records.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    /** Unique ULID identifier */
    id: varchar('id', { length: 26 }).primaryKey(),
    /** Foreign key mapping entries to their parent transaction */
    transactionId: varchar('transaction_id', { length: 26 })
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
    /** Target account string reference bound cross-service */
    accountId: varchar('account_id', { length: 26 }).notNull(),
    /** Branded monetary amount in Paise (absolute values only) */
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    /** Direction: CREDIT or DEBIT */
    direction: varchar('direction', { length: 10 }).notNull(), // 'CREDIT', 'DEBIT'
    /** Appended timestamp marker */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Essential optimization for balance/stream calculations
    index('idx_entries_account_lookup').on(table.accountId, table.createdAt),
    // Double-accounting collision protection
    unique('idx_entries_tx_direction').on(table.transactionId, table.accountId, table.direction),
  ],
);

/**
 * Balance Snapshots Table Schema.
 * Stores daily balance snapshots per account for quick balance synthesis.
 */
export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: varchar('id', { length: 26 }).primaryKey(), // ULID
    accountId: varchar('account_id', { length: 26 }).notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    balancePaise: bigint('balance_paise', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    lastProcessedEntryId: varchar('last_processed_entry_id', { length: 26 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('unique_account_date_snapshot').on(table.accountId, table.snapshotDate)],
);

/**
 * Inbox Messages Table Schema.
 * Idempotency registry for consumer processes.
 */
export const inboxMessages = pgTable('inbox_messages', {
  id: varchar('id', { length: 26 }).primaryKey(), // Event ID from envelope (ULID)
  eventType: varchar('event_type', { length: 255 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── RELATIONSHIPS ───────────────────────────────────────────────────────────

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ many }) => ({
  entries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(ledgerTransactions, {
    fields: [ledgerEntries.transactionId],
    references: [ledgerTransactions.id],
  }),
}));
