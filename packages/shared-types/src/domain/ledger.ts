import type { ULID, Paise, CurrencyType } from './types';

export type EntryDirection = 'CREDIT' | 'DEBIT';
export type LedgerPurpose = 'USER_TRANSFER' | 'DEPOSIT' | 'FEE' | 'REVERSAL';

/**
 * Immutable transaction wrapper record within the ledger engine.
 * Once appended to the ledger database, this record must never be updated or deleted.
 */
export interface LedgerTransaction {
  /** 26-character time-sortable alphanumeric ledger-bound primary key */
  id: ULID;

  /** Coordinated reference link connecting back directly to the triggering Transfer Saga */
  referenceId: ULID;

  /** Categorizes the operational intent behind this double-entry execution loop */
  purpose: LedgerPurpose;

  /** Strict ISO 4217 parameter code validating matching currency criteria across lines */
  currency: CurrencyType;

  /** The definitive, unalterable execution timestamp recorded by the ledger engine */
  timestamp: Date;
}

/**
 * Individual balanced entry line item representing a single debit or credit adjustment.
 * Total Debits must exactly equal Total Credits for any matching transaction id.
 */
export interface LedgerEntry {
  /** Time-sortable unique identifier for this entry line */
  id: ULID;

  /** Foreign key binding this specific line to its parent transaction container */
  transactionId: ULID;

  /** Target account string identifier where this specific financial line item applies */
  accountId: ULID;

  /** Strict 64-bit signed integer tracking the transaction volume in the lowest denomination (Paise) */
  amountPaise: Paise;

  /** Denotes the vector direction of the funds: INCREASES credits, DECREASES debits depending on account types */
  direction: EntryDirection;

  /** Chronological marker when this immutable entry row was appended to the database engine */
  createdAt: Date;
}
