import { ULID } from './types';

export type EntryDirection = 'CREDIT' | 'DEBIT';

export interface LedgerTransaction {
  id: ULID; // ULID
  referenceId: string; // ULID linking back to the Transfer Saga
  purpose: 'USER_TRANSFER' | 'DEPOSIT' | 'FEE' | 'REVERSAL'; // e.g., 'P2P_TRANSFER', 'DEPOSIT'
  timestamp: Date;
}

export interface LedgerEntry {
  id: ULID; // ULID
  transactionId: ULID; // ULID
  accountId: ULID; // ULID
  amountPaise: number; // Strict Integer representation
  direction: EntryDirection;
  createdAt: Date;
}
