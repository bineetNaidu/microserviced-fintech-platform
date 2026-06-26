import type { Paise, ULID } from './types';

export type TransferStatus =
  | 'PENDING'
  | 'DEBITING'
  | 'CREDITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSING'
  | 'REVERSED';

export interface Transfer {
  id: ULID; // ULID
  idempotencyKey: ULID | string; // Unique UUID/String from client
  fromAccountId: ULID; // ULID
  toAccountId: ULID; // ULID
  amountPaise: Paise;
  status: TransferStatus;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}
