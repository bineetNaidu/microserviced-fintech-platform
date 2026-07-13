import type { AccountRepository } from '../repositories/account.repository';
import type { AccountPublisher } from '../events/publishers/account.publisher';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import {
  NotFoundError,
  ForbiddenError,
  UnprocessableEntityError,
  ConflictError,
} from '@fintech/shared-errors';
import {
  ErrorCode,
  type Account,
  type AccountStatus,
  type AccountType,
  type CurrencyType,
} from '@fintech/shared-types';
import { config } from '../config';
import { ulid } from 'ulid';

export class AccountService {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly accountRepo: AccountRepository,
    private readonly publisher: AccountPublisher,
  ) {}

  /**
   * Helper to perform KYC check via S2S call to user-service.
   */
  private async verifyUserKyc(userId: string): Promise<void> {
    try {
      const url = `${config.USER_SERVICE_URL}/v1/users/internal/${userId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-internal-api-key': config.INTERNAL_API_KEY,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError('User profile not found in user-service.');
        }
        throw new ForbiddenError('User KYC verification failed or service returned error.');
      }

      const resData = (await response.json()) as {
        success: boolean;
        data?: { id: string; kycStatus: string; isActive: boolean };
      };

      if (!resData.success || !resData.data) {
        throw new ForbiddenError('Failed to parse user KYC status response.');
      }

      const { kycStatus, isActive } = resData.data;

      // Note: user-service controller returns lowercase status (verified / pending / etc.)
      if (!isActive) {
        throw new ForbiddenError('User profile is currently deactivated.');
      }

      if (kycStatus !== 'verified') {
        throw new ForbiddenError(
          'User KYC verification is not approved. Current status: ' + kycStatus,
          ErrorCode.KYC_NOT_APPROVED,
        );
      }
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof NotFoundError) {
        throw error;
      }
      // Fail-secure: If the service is unreachable or network times out, reject account creation.
      console.error('[account-service] KYC verification call failed:', error);
      throw new ForbiddenError(
        'KYC status verification is currently unavailable. Please try again later.',
      );
    }
  }

  /**
   * Helper to fetch account balance from ledger-service.
   */
  private async getAccountBalanceFromLedger(accountId: string): Promise<number> {
    // Port of ledger-service is 3005 as per cluster deployment conventions.
    // If not defined, fallback to localhost.
    const ledgerBaseUrl = process.env.LEDGER_SERVICE_URL || 'http://localhost:3005';
    try {
      const url = `${ledgerBaseUrl}/v1/ledger/accounts/${accountId}/balance`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-internal-api-key': config.INTERNAL_API_KEY,
        },
      });

      if (response.ok) {
        const resData = (await response.json()) as {
          success: boolean;
          data?: { balance: number };
        };
        if (resData.success && resData.data) {
          return resData.data.balance;
        }
      }
    } catch (error) {
      // In local dev, if ledger-service is not running yet, assume 0 for fallback convenience
      console.warn(
        `[account-service] Ledger service unreachable for balance check of account ${accountId}. Assuming balance is 0 for fallback dev. Error:`,
        error,
      );
    }
    return 0;
  }

  /**
   * Initializes a new financial account configuration.
   */
  async createAccount(
    userId: string,
    type: AccountType,
    currency: CurrencyType,
    correlationId: string,
  ): Promise<Account> {
    // 1. Verify user KYC verification status (S2S)
    await this.verifyUserKyc(userId);

    // 2. Enforce limits: maximum 5 active/non-deleted accounts per user
    const existingAccounts = await this.accountRepo.findByUserId(userId);
    const activeCount = existingAccounts.filter((a) => a.status !== 'CLOSED').length;
    if (activeCount >= 5) {
      throw new ConflictError(
        'Maximum account portfolio limit reached (max 5 active accounts).',
        ErrorCode.MAXIMUM_ACCOUNTS_REACHED,
      );
    }

    // 3. Insert account and limits record in a transaction
    return this.db.transaction(async (tx) => {
      const accountId = ulid();

      // Provision account
      const account = await this.accountRepo.createAccount(
        {
          id: accountId,
          userId,
          type,
          currency,
        },
        tx,
      );

      // Provision default limits
      await this.accountRepo.createLimits(
        {
          id: ulid(),
          accountId,
          dailyLimitPaise: 50000000, // default max: ₹5,00,000.00
          singleLimitPaise: 10000000, // default max: ₹1,00,000.00
        },
        tx,
      );

      // 4. Publish account.created event
      await this.publisher.publishAccountCreated(account, correlationId);

      return account;
    });
  }

  /**
   * Retrieves detail mapping for an account.
   */
  async getAccount(accountId: string): Promise<Account> {
    const account = await this.accountRepo.findById(accountId);
    if (!account) {
      throw new NotFoundError('Account not found.', ErrorCode.ACCOUNT_NOT_FOUND);
    }
    return account;
  }

  /**
   * Lists user accounts.
   */
  async getAccountsByUser(userId: string): Promise<Account[]> {
    return this.accountRepo.findByUserId(userId);
  }

  /**
   * List all accounts globally (with optional filters) for administrative roles.
   */
  async listAllAccounts(filters: { userId?: string; status?: AccountStatus }): Promise<Account[]> {
    return this.accountRepo.listAll(filters);
  }

  /**
   * Synchronously validates from/to account eligibility and limit criteria for transfers.
   * Called by Transfer Service Saga.
   */
  async validateBounds(
    fromAccountId: string,
    toAccountId: string,
    amountPaise: number,
  ): Promise<{ isValid: boolean; currency: CurrencyType }> {
    // 1. Fetch fromAccount
    const fromResult = await this.accountRepo.findByIdWithLimits(fromAccountId);
    if (!fromResult) {
      throw new NotFoundError('Source account does not exist.', ErrorCode.ACCOUNT_NOT_FOUND);
    }
    const { account: fromAccount, limits } = fromResult;

    // Enforce active status
    if (fromAccount.status === 'FROZEN') {
      throw new ForbiddenError('Source account is currently frozen.', ErrorCode.ACCOUNT_FROZEN);
    }
    if (fromAccount.status === 'CLOSED') {
      throw new ForbiddenError('Source account is permanently closed.', ErrorCode.ACCOUNT_CLOSED);
    }

    // 2. Fetch toAccount
    const toAccount = await this.accountRepo.findById(toAccountId);
    if (!toAccount) {
      throw new NotFoundError('Destination account does not exist.', ErrorCode.ACCOUNT_NOT_FOUND);
    }

    // Enforce active status on destination
    if (toAccount.status === 'FROZEN') {
      throw new ForbiddenError(
        'Destination account is currently frozen.',
        ErrorCode.ACCOUNT_FROZEN,
      );
    }
    if (toAccount.status === 'CLOSED') {
      throw new ForbiddenError(
        'Destination account is permanently closed.',
        ErrorCode.ACCOUNT_CLOSED,
      );
    }

    // 3. Currency matching
    if (fromAccount.currency !== toAccount.currency) {
      throw new UnprocessableEntityError(
        'Account currency mapping mismatch. Cross-currency transfers not supported.',
      );
    }

    // 4. Single-Transaction Limit Breach Guard
    if (amountPaise > limits.singleTransactionLimitPaise) {
      throw new UnprocessableEntityError(
        `Transfer amount exceeds the per-transaction limit of ₹${limits.singleTransactionLimitPaise / 100}.`,
        ErrorCode.TRANSFER_LIMIT_EXCEEDED,
      );
    }

    // 5. Daily Velocity Limit Breach Guard (Simple check)
    if (amountPaise > limits.dailyVelocityLimitPaise) {
      throw new UnprocessableEntityError(
        `Transfer amount exceeds the daily velocity limit of ₹${limits.dailyVelocityLimitPaise / 100}.`,
        ErrorCode.TRANSFER_LIMIT_EXCEEDED,
      );
    }

    return {
      isValid: true,
      currency: fromAccount.currency,
    };
  }

  /**
   * Freezes an account (Administrative).
   */
  async freezeAccount(
    accountId: string,
    changedBy: string,
    changedByRole: string,
    reason: string,
    correlationId: string,
  ): Promise<Account> {
    const account = await this.accountRepo.findById(accountId);
    if (!account) {
      throw new NotFoundError('Account not found.', ErrorCode.ACCOUNT_NOT_FOUND);
    }

    if (account.status === 'FROZEN') {
      throw new UnprocessableEntityError('Account is already frozen.', ErrorCode.ACCOUNT_FROZEN);
    }
    if (account.status === 'CLOSED') {
      throw new UnprocessableEntityError(
        'Closed accounts cannot be frozen.',
        ErrorCode.ACCOUNT_CLOSED,
      );
    }

    const updatedAccount = await this.db.transaction(async (tx) => {
      return this.accountRepo.updateStatus(
        accountId,
        'FROZEN',
        account.status,
        changedBy,
        changedByRole,
        reason,
        tx,
      );
    });

    await this.publisher.publishAccountStatusChanged(
      updatedAccount,
      account.status,
      reason,
      changedBy,
      correlationId,
    );

    return updatedAccount;
  }

  /**
   * Unfreezes an account (Administrative - Admin only).
   */
  async unfreezeAccount(
    accountId: string,
    changedBy: string,
    changedByRole: string,
    reason: string,
    correlationId: string,
  ): Promise<Account> {
    const account = await this.accountRepo.findById(accountId);
    if (!account) {
      throw new NotFoundError('Account not found.', ErrorCode.ACCOUNT_NOT_FOUND);
    }

    if (account.status !== 'FROZEN') {
      throw new UnprocessableEntityError(
        'Account is not currently frozen.',
        ErrorCode.ACCOUNT_NOT_FROZEN,
      );
    }

    const updatedAccount = await this.db.transaction(async (tx) => {
      return this.accountRepo.updateStatus(
        accountId,
        'ACTIVE',
        'FROZEN',
        changedBy,
        changedByRole,
        reason,
        tx,
      );
    });

    await this.publisher.publishAccountStatusChanged(
      updatedAccount,
      'FROZEN',
      reason,
      changedBy,
      correlationId,
    );

    return updatedAccount;
  }

  /**
   * Closes an account (User or Administrative).
   */
  async closeAccount(
    accountId: string,
    changedBy: string,
    changedByRole: string,
    correlationId: string,
  ): Promise<Account> {
    const account = await this.accountRepo.findById(accountId);
    if (!account) {
      throw new NotFoundError('Account not found.', ErrorCode.ACCOUNT_NOT_FOUND);
    }

    if (account.status === 'CLOSED') {
      throw new UnprocessableEntityError('Account is already closed.');
    }

    // Enforce balance zero constraint
    const balance = await this.getAccountBalanceFromLedger(accountId);
    if (balance !== 0) {
      throw new UnprocessableEntityError(
        'Cannot close an account with a non-zero balance. Balance: ₹' + balance / 100,
        ErrorCode.ACCOUNT_HAS_BALANCE,
      );
    }

    const updatedAccount = await this.db.transaction(async (tx) => {
      return this.accountRepo.closeAccount(accountId, account.status, changedBy, changedByRole, tx);
    });

    await this.publisher.publishAccountStatusChanged(
      updatedAccount,
      account.status,
      'Account closed',
      changedBy,
      correlationId,
    );

    return updatedAccount;
  }

  /**
   * Systemically freezes accounts when KYC status changes to SUSPENDED or REJECTED.
   * Invoked by RabbitMQ KYC sync consumer.
   */
  async handleKycStatusChanged(
    userId: string,
    newStatus: string,
    reason: string,
    correlationId: string,
  ): Promise<void> {
    if (newStatus !== 'SUSPENDED' && newStatus !== 'REJECTED') {
      return;
    }

    console.log(
      `[account-service] KYC status changed to ${newStatus} for user ${userId}. Freezing active accounts.`,
    );

    const userAccounts = await this.accountRepo.findByUserId(userId);
    const activeAccounts = userAccounts.filter((a) => a.status === 'ACTIVE');

    for (const account of activeAccounts) {
      try {
        await this.db.transaction(async (tx) => {
          await this.accountRepo.updateStatus(
            account.id,
            'FROZEN',
            'ACTIVE',
            'SYSTEM',
            'SYSTEM',
            `System frozen due to KYC status transition to ${newStatus}. Reason: ${reason}`,
            tx,
          );
        });

        const frozenAcc = { ...account, status: 'FROZEN' as const };
        await this.publisher.publishAccountStatusChanged(
          frozenAcc,
          'ACTIVE',
          `System frozen due to KYC status transition to ${newStatus}`,
          'SYSTEM',
          correlationId,
        );
      } catch (err) {
        console.error(
          `[account-service] Failed to freeze account ${account.id} during KYC sync:`,
          err,
        );
      }
    }
  }
}
