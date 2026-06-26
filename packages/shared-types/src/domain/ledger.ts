import type { ULID, Paise, CurrencyType } from './types';

export type EntryDirection = 'CREDIT' | 'DEBIT';

export interface LedgerTransaction {
  id: ULID;
  referenceId: ULID; // Forces structural reference link
  purpose: 'USER_TRANSFER' | 'DEPOSIT' | 'FEE' | 'REVERSAL';
  currency: CurrencyType; // Validates matching currency parameters cross-ledger
  timestamp: Date;
}

export interface LedgerEntry {
  id: ULID;
  transactionId: ULID;
  accountId: ULID;
  amountPaise: Paise;
  direction: EntryDirection;
  createdAt: Date;
}
