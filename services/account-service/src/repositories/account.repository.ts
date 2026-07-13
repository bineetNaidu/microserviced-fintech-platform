import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Account, AccountStatus, AccountType, CurrencyType } from '@fintech/shared-types';

export type TransactionContext = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export class AccountRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private getDb(tx?: TransactionContext) {
    return tx || this.db;
  }

  /**
   * Helper that maps database row types to canonical typescript Account type.
   */
  private toDomain(dbAcc: typeof schema.accounts.$inferSelect): Account {
    return {
      id: dbAcc.id,
      userId: dbAcc.userId,
      type: dbAcc.type as AccountType,
      status: dbAcc.status as AccountStatus,
      currency: dbAcc.currency as CurrencyType,
      createdAt: dbAcc.createdAt,
      updatedAt: dbAcc.updatedAt,
    };
  }

  /**
   * Find account by ID. Ignores soft-deleted accounts.
   */
  async findById(id: string, tx?: TransactionContext): Promise<Account | null> {
    const result = await this.getDb(tx).query.accounts.findFirst({
      where: and(eq(schema.accounts.id, id), isNull(schema.accounts.deletedAt)),
    });

    if (!result) {
      return null;
    }
    return this.toDomain(result);
  }

  /**
   * Find account by ID including limits.
   */
  async findByIdWithLimits(
    id: string,
    tx?: TransactionContext,
  ): Promise<{ account: Account; limits: typeof schema.accountLimits.$inferSelect } | null> {
    const result = await this.getDb(tx).query.accounts.findFirst({
      where: and(eq(schema.accounts.id, id), isNull(schema.accounts.deletedAt)),
      with: {
        limits: true,
      },
    });

    if (!result || !result.limits) {
      return null;
    }
    return {
      account: this.toDomain(result),
      limits: result.limits,
    };
  }

  /**
   * Lists all non-deleted accounts for a given user.
   */
  async findByUserId(userId: string, tx?: TransactionContext): Promise<Account[]> {
    const results = await this.getDb(tx).query.accounts.findMany({
      where: and(eq(schema.accounts.userId, userId), isNull(schema.accounts.deletedAt)),
    });

    return results.map((r) => this.toDomain(r));
  }

  /**
   * Lists all active accounts globally (with optional user_id filter).
   * For Support Agents, Auditors and Admins.
   */
  async listAll(
    filters: { userId?: string; status?: AccountStatus } = {},
    tx?: TransactionContext,
  ): Promise<Account[]> {
    const dbContext = this.getDb(tx);
    const conditions = [isNull(schema.accounts.deletedAt)];

    if (filters.userId) {
      conditions.push(eq(schema.accounts.userId, filters.userId));
    }
    if (filters.status) {
      conditions.push(eq(schema.accounts.status, filters.status));
    }

    const results = await dbContext.query.accounts.findMany({
      where: and(...conditions),
    });

    return results.map((r) => this.toDomain(r));
  }

  /**
   * Inserts a new financial account configuration.
   */
  async createAccount(
    data: {
      id: string;
      userId: string;
      type: AccountType;
      currency: CurrencyType;
    },
    tx?: TransactionContext,
  ): Promise<Account> {
    const dbContext = this.getDb(tx);

    const [dbAcc] = await dbContext
      .insert(schema.accounts)
      .values({
        id: data.id,
        userId: data.userId,
        type: data.type,
        currency: data.currency,
        status: 'ACTIVE',
      })
      .returning();

    return this.toDomain(dbAcc);
  }

  /**
   * Provisions operational limits for an account.
   */
  async createLimits(
    data: {
      id: string;
      accountId: string;
      dailyLimitPaise?: number;
      singleLimitPaise?: number;
    },
    tx?: TransactionContext,
  ): Promise<typeof schema.accountLimits.$inferSelect> {
    const dbContext = this.getDb(tx);

    const [limits] = await dbContext
      .insert(schema.accountLimits)
      .values({
        id: data.id,
        accountId: data.accountId,
        dailyVelocityLimitPaise: data.dailyLimitPaise ?? 50000000,
        singleTransactionLimitPaise: data.singleLimitPaise ?? 10000000,
      })
      .returning();

    return limits;
  }

  /**
   * Updates an account's status, logs in historical audit pool, and updates timestamps.
   */
  async updateStatus(
    accountId: string,
    newStatus: AccountStatus,
    previousStatus: AccountStatus,
    changedBy: string,
    changedByRole: string,
    reason: string,
    tx?: TransactionContext,
  ): Promise<Account> {
    const dbContext = this.getDb(tx);

    // Update account record
    const [dbAcc] = await dbContext
      .update(schema.accounts)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId))
      .returning();

    // Log history record
    await dbContext.insert(schema.accountStatusHistory).values({
      accountId,
      previousStatus,
      newStatus,
      changedBy,
      changedByRole,
      reason,
    });

    return this.toDomain(dbAcc);
  }

  /**
   * Sets closed state and soft deletes the account row.
   */
  async closeAccount(
    accountId: string,
    previousStatus: AccountStatus,
    changedBy: string,
    changedByRole: string,
    tx?: TransactionContext,
  ): Promise<Account> {
    const dbContext = this.getDb(tx);

    const [dbAcc] = await dbContext
      .update(schema.accounts)
      .set({
        status: 'CLOSED',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId))
      .returning();

    await dbContext.insert(schema.accountStatusHistory).values({
      accountId,
      previousStatus,
      newStatus: 'CLOSED',
      changedBy,
      changedByRole,
      reason: 'User closed account',
    });

    return this.toDomain(dbAcc);
  }
}
