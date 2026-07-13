import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import { eq, and, gt, desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import type {
  LedgerTransaction,
  LedgerEntry,
  LedgerPurpose,
  CurrencyType,
  EntryDirection,
  Paise,
} from '@fintech/shared-types';

export type DBContext = NodePgDatabase<typeof schema>;
export type TransactionContext = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export class LedgerRepository {
  constructor(private readonly db: DBContext) {}

  private getDb(tx?: TransactionContext) {
    return tx || this.db;
  }

  /**
   * Appends a new transaction wrapper to the ledger.
   */
  async createTransaction(
    txData: typeof schema.ledgerTransactions.$inferInsert,
    tx?: TransactionContext,
  ): Promise<LedgerTransaction> {
    const [result] = await this.getDb(tx)
      .insert(schema.ledgerTransactions)
      .values(txData)
      .returning();

    return {
      id: result.id,
      referenceId: result.referenceId,
      purpose: result.purpose as LedgerPurpose,
      currency: result.currency as CurrencyType,
      timestamp: result.timestamp,
    };
  }

  /**
   * Appends an entry line to the ledger.
   */
  async createEntry(
    entryData: typeof schema.ledgerEntries.$inferInsert,
    tx?: TransactionContext,
  ): Promise<LedgerEntry> {
    const [result] = await this.getDb(tx)
      .insert(schema.ledgerEntries)
      .values(entryData)
      .returning();

    return {
      id: result.id,
      transactionId: result.transactionId,
      accountId: result.accountId,
      amountPaise: result.amountPaise as Paise,
      direction: result.direction as EntryDirection,
      createdAt: result.createdAt,
    };
  }

  /**
   * Retrieves the latest daily balance snapshot for a specific account.
   */
  async getLatestSnapshot(
    accountId: string,
    tx?: TransactionContext,
  ): Promise<typeof schema.balanceSnapshots.$inferSelect | null> {
    const result = await this.getDb(tx)
      .select()
      .from(schema.balanceSnapshots)
      .where(eq(schema.balanceSnapshots.accountId, accountId))
      .orderBy(desc(schema.balanceSnapshots.snapshotDate))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Returns all entries for an account created after a specific entry ID (lexicographically).
   */
  async getEntriesAfterEntryId(
    accountId: string,
    lastProcessedEntryId: string,
    tx?: TransactionContext,
  ): Promise<LedgerEntry[]> {
    const results = await this.getDb(tx)
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.accountId, accountId),
          gt(schema.ledgerEntries.id, lastProcessedEntryId),
        ),
      );

    return results.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      accountId: r.accountId,
      amountPaise: r.amountPaise as Paise,
      direction: r.direction as EntryDirection,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Returns all entries for an account from the beginning of time.
   */
  async getAllEntriesForAccount(
    accountId: string,
    tx?: TransactionContext,
  ): Promise<LedgerEntry[]> {
    const results = await this.getDb(tx)
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId));

    return results.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      accountId: r.accountId,
      amountPaise: r.amountPaise as Paise,
      direction: r.direction as EntryDirection,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Retrieves all distinct account IDs that have recorded entries.
   * Useful for background daily snapshot sweeps.
   */
  async getDistinctAccountIds(tx?: TransactionContext): Promise<string[]> {
    const results = await this.getDb(tx)
      .select({ accountId: schema.ledgerEntries.accountId })
      .from(schema.ledgerEntries)
      .groupBy(schema.ledgerEntries.accountId);

    return results.map((r) => r.accountId);
  }

  /**
   * Creates or updates a daily balance snapshot for an account.
   */
  async createSnapshot(
    snapshotData: typeof schema.balanceSnapshots.$inferInsert,
    tx?: TransactionContext,
  ): Promise<typeof schema.balanceSnapshots.$inferSelect> {
    const [result] = await this.getDb(tx)
      .insert(schema.balanceSnapshots)
      .values(snapshotData)
      .onConflictDoUpdate({
        target: [schema.balanceSnapshots.accountId, schema.balanceSnapshots.snapshotDate],
        set: {
          balancePaise: snapshotData.balancePaise,
          lastProcessedEntryId: snapshotData.lastProcessedEntryId,
          createdAt: new Date(),
        },
      })
      .returning();

    return result;
  }

  /**
   * Retrieves the absolute latest ledger entry for an account (useful to get the boundary entry ID).
   */
  async getLatestEntryForAccount(
    accountId: string,
    tx?: TransactionContext,
  ): Promise<LedgerEntry | null> {
    const results = await this.getDb(tx)
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.accountId, accountId))
      .orderBy(desc(schema.ledgerEntries.id))
      .limit(1);

    if (!results[0]) {
      return null;
    }

    const r = results[0];
    return {
      id: r.id,
      transactionId: r.transactionId,
      accountId: r.accountId,
      amountPaise: r.amountPaise as Paise,
      direction: r.direction as EntryDirection,
      createdAt: r.createdAt,
    };
  }
}
