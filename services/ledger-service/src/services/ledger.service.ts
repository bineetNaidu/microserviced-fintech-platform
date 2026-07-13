import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import * as schema from '../db/schema';
import type { LedgerRepository, TransactionContext } from '../repositories/ledger.repository';
import type { LedgerPublisher } from '../events/publishers/ledger.publisher';
import { BadRequestError, InsufficientFundsError } from '@fintech/shared-errors';
import { ErrorCode } from '@fintech/shared-types';
import type {
  CreateLedgerTransactionDto,
  LedgerTransactionResponseDto,
  CurrencyType,
} from '@fintech/shared-types';

export class LedgerService {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly ledgerRepo: LedgerRepository,
    private readonly publisher: LedgerPublisher,
  ) {}

  /**
   * Calculates the active balance for a specific account.
   * Active balance = Latest Daily Snapshot Balance + Sum of Entries created after the snapshot's last processed entry.
   * If no snapshot exists, calculates by summing all entries chronologically from the beginning of time.
   */
  async calculateBalance(
    accountId: string,
    tx?: TransactionContext,
  ): Promise<{ balance: number; currency: string }> {
    // 1. Fetch latest daily snapshot
    const latestSnapshot = await this.ledgerRepo.getLatestSnapshot(accountId, tx);

    if (latestSnapshot) {
      // 2. Sum entries created after the snapshot's boundary entry ID
      const entries = await this.ledgerRepo.getEntriesAfterEntryId(
        accountId,
        latestSnapshot.lastProcessedEntryId,
        tx,
      );

      let delta = 0;
      for (const entry of entries) {
        if (entry.direction === 'CREDIT') {
          delta += entry.amountPaise;
        } else if (entry.direction === 'DEBIT') {
          delta -= entry.amountPaise;
        }
      }

      return {
        balance: latestSnapshot.balancePaise + delta,
        currency: latestSnapshot.currency.trim(),
      };
    }

    // 3. Fallback: Sum all entries if no snapshot exists yet
    const entries = await this.ledgerRepo.getAllEntriesForAccount(accountId, tx);
    let total = 0;
    let currency = 'INR';

    for (const entry of entries) {
      if (entry.direction === 'CREDIT') {
        total += entry.amountPaise;
      } else if (entry.direction === 'DEBIT') {
        total -= entry.amountPaise;
      }
      // Infer currency if entries exist (fallback default INR otherwise)
      // Note: Entries table does not store currency directly, but parent transaction does.
      // However, snapshots store currency, and transactions are validated to match currency.
    }

    // Attempt to load currency from first entry's transaction if entries exist
    if (entries.length > 0) {
      const txDetails = await this.db.query.ledgerTransactions.findFirst({
        where: (tbl, { eq }) => eq(tbl.id, entries[0].transactionId),
      });
      if (txDetails) {
        currency = txDetails.currency.trim();
      }
    }

    return {
      balance: total,
      currency,
    };
  }

  /**
   * Appends a balanced double-entry transaction record.
   * Strictly executed under SERIALIZABLE transaction isolation level.
   */
  async recordTransaction(
    dto: CreateLedgerTransactionDto,
    correlationId: string,
  ): Promise<LedgerTransactionResponseDto> {
    const { referenceId, purpose, currency, entries } = dto;

    // ─── 1. MATHEMATICAL EQUATION INVARIANT GUARD ───────────────────────────
    let sumDebits = 0;
    let sumCredits = 0;
    const affectedAccountsSet = new Set<string>();

    for (const entry of entries) {
      if (entry.amountPaise <= 0) {
        throw new BadRequestError(
          `Entry amount must be strictly greater than 0 paise. Received: ${entry.amountPaise} for account ${entry.accountId}`,
          [],
          ErrorCode.VALIDATION_FAILED,
        );
      }

      if (entry.direction === 'DEBIT') {
        sumDebits += entry.amountPaise;
      } else if (entry.direction === 'CREDIT') {
        sumCredits += entry.amountPaise;
      } else {
        throw new BadRequestError(
          `Invalid entry direction. Expected 'DEBIT' or 'CREDIT', received: ${entry.direction}`,
        );
      }
      affectedAccountsSet.add(entry.accountId);
    }

    if (sumDebits !== sumCredits) {
      throw new BadRequestError(
        `Double-entry balance violation: Sum of DEBITs (${sumDebits} paise) must exactly equal Sum of CREDITs (${sumCredits} paise).`,
        [],
        ErrorCode.VALIDATION_FAILED,
      );
    }

    // ─── 2. ATOMIC DATABASE RECORDING (SERIALIZABLE) ──────────────────────────
    const txId = ulid();

    await this.db.transaction(async (tx) => {
      // Set transaction isolation level to SERIALIZABLE to prevent concurrent double-spends
      await tx.execute(sql.raw('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'));

      // Check unique reference constraint to prevent duplicate processing of the same Transfer Saga
      const existingTx = await tx.query.ledgerTransactions.findFirst({
        where: (tbl, { eq }) => eq(tbl.referenceId, referenceId),
      });
      if (existingTx) {
        throw new BadRequestError(
          `Ledger transaction with reference ID ${referenceId} already exists.`,
          [],
          ErrorCode.CONFLICT,
        );
      }

      // Validate balances for all debit entries to ensure no account is driven below 0
      for (const entry of entries) {
        if (entry.direction === 'DEBIT') {
          const { balance: currentBalance } = await this.calculateBalance(entry.accountId, tx);
          if (currentBalance < entry.amountPaise) {
            // Insufficient funds: publish breach event and raise error
            await this.publisher.publishBalanceBreached(
              entry.accountId,
              entry.amountPaise,
              currentBalance,
              referenceId,
              'Insufficient funds to cover debit line item.',
              correlationId,
            );

            throw new InsufficientFundsError(
              `Account ${entry.accountId} has insufficient funds. Current balance: ${currentBalance} paise, requested debit: ${entry.amountPaise} paise.`,
            );
          }
        }
      }

      // Record parent transaction record
      await this.ledgerRepo.createTransaction(
        {
          id: txId,
          referenceId,
          purpose,
          currency,
        },
        tx,
      );

      // Record child entries
      for (const entry of entries) {
        await this.ledgerRepo.createEntry(
          {
            id: ulid(),
            transactionId: txId,
            accountId: entry.accountId,
            amountPaise: entry.amountPaise,
            direction: entry.direction,
          },
          tx,
        );
      }
    });

    // ─── 3. BROADCAST EVENT downstream ─────────────────────────────────────
    await this.publisher.publishTransactionPosted(
      txId,
      referenceId,
      currency,
      Array.from(affectedAccountsSet),
      correlationId,
    );

    return {
      transactionId: txId,
      status: 'RECORDED',
    };
  }

  /**
   * Generates a daily balance snapshot for all active accounts.
   * Materializes the current balance state up to the latest recorded entry as of the end of the target day.
   */
  async runSnapshotSweep(targetDateStr: string, tx: TransactionContext): Promise<void> {
    const targetDate = new Date(targetDateStr);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestError(`Invalid target date format: ${targetDateStr}`);
    }

    console.log(
      `[ledger-service] Starting balance snapshot sweep for target date: ${targetDateStr}`,
    );

    // Retrieve list of all unique account IDs in the ledger
    const accountIds = await this.ledgerRepo.getDistinctAccountIds(tx);

    for (const accountId of accountIds) {
      // Fetch latest recorded entry for this account
      const latestEntry = await this.ledgerRepo.getLatestEntryForAccount(accountId, tx);
      if (!latestEntry) {
        continue;
      }

      // Calculate balance up to this point
      const { balance, currency } = await this.calculateBalance(accountId, tx);

      // Save daily snapshot record
      await this.ledgerRepo.createSnapshot(
        {
          id: ulid(),
          accountId,
          snapshotDate: targetDateStr,
          balancePaise: balance,
          currency: currency as CurrencyType,
          lastProcessedEntryId: latestEntry.id,
        },
        tx,
      );
    }

    console.log(`[ledger-service] Completed snapshot sweep for ${accountIds.length} accounts.`);
  }
}
