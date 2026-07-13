import type { ULID, CurrencyType } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

/**
 * Event payload broadcasted downstream when a ledger transaction has been successfully committed.
 */
export interface LedgerTransactionPostedEventData {
  transactionId: ULID;
  referenceId: ULID;
  currency: CurrencyType;
  affectedAccounts: ULID[];
}

/**
 * Event payload broadcasted downstream when a debit operation is blocked due to insufficient funds.
 */
export interface LedgerBalanceBreachedEventData {
  accountId: ULID;
  amountPaise: number;
  currentBalancePaise: number;
  referenceId: ULID;
  reason: string;
}

// Strictly typed structural envelopes
export type LedgerTransactionPostedEvent = EventEnvelope<LedgerTransactionPostedEventData>;
export type LedgerBalanceBreachedEvent = EventEnvelope<LedgerBalanceBreachedEventData>;
