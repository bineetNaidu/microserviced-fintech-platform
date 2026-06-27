import type { ULID, Paise, CurrencyType } from './types';

export type TransferStatus =
  | 'PENDING' // Initial registration state before any balance bounds or limits are validated
  | 'DEBITING' // Synchronous phase indicating the ledger balance reservation step has been initiated
  | 'CREDITING' // Phase where matching target destination accounts are being updated
  | 'COMPLETED' // Final state indicating the forward Saga transaction has successfully concluded
  | 'FAILED' // Explicit terminal state indicating termination before any database balances were shifted
  | 'REVERSING' // Compensation path active; restoring sender funds due to a downstream failure
  | 'REVERSED'; // Terminal state indicating structural compensation has completed successfully

/**
 * Distributed Saga state machine wrapper tracking distributed balance updates.
 * Orchestrates multi-service atomic transitions across the Account and Ledger domains.
 */
export interface Transfer {
  /** 26-character time-sortable alphanumeric transaction lifecycle tracking key */
  id: ULID;

  /** * Strict client-supplied string token enforced at the API Gateway edge.
   * Prevents accidental double-submission or transaction replication bugs under network latency.
   */
  idempotencyKey: string;

  /** Foreign key pointing to the source checking account rule record */
  fromAccountId: ULID;

  /** Foreign key pointing to the recipient destination account rule record */
  toAccountId: ULID;

  /** Strict 64-bit integer representing the transaction volume in lowest currency fraction (Paise) */
  amountPaise: Paise;

  /** ISO 4217 parameter token ensuring sender and ledger match values perfectly */
  currency: CurrencyType;

  /** Current state tracker utilized by retry sweepers and background execution loops */
  status: TransferStatus;

  /** Descriptive error log payload detailing downstream transaction rejections */
  failureReason?: string;

  /** Chronological marker when the transfer orchestration loop was initiated */
  createdAt: Date;

  /** Chronological marker when the state engine last shifted status properties */
  updatedAt: Date;
}
