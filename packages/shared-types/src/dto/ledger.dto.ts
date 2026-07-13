import type { ULID, CurrencyType } from '../domain/types';
import type { EntryDirection, LedgerPurpose } from '../domain/ledger';

/**
 * Data Transfer Object for an individual entry line item within a ledger transaction.
 */
export interface LedgerEntryDto {
  /** Target account string identifier where this line applies */
  accountId: ULID;

  /** Value in paise (strictly positive integer) */
  amountPaise: number;

  /** 'CREDIT' or 'DEBIT' */
  direction: EntryDirection;
}

/**
 * Data Transfer Object for recording a balanced double-entry transaction.
 */
export interface CreateLedgerTransactionDto {
  /** Coordinated ULID reference from the orchestrator saga */
  referenceId: ULID;

  /** The reason or intent of the transaction */
  purpose: LedgerPurpose;

  /** The transaction currency */
  currency: CurrencyType;

  /** Balanced entries representing debits and credits */
  entries: LedgerEntryDto[];
}

/**
 * Response returned after a ledger transaction has been successfully committed to the database.
 */
export interface LedgerTransactionResponseDto {
  transactionId: ULID;
  status: 'RECORDED';
}

/**
 * Response mapping for account balance query.
 */
export interface AccountBalanceResponseDto {
  accountId: ULID;
  balance: number; // In paise
  currency: CurrencyType;
}
