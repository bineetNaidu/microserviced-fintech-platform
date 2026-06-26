import type { ULID, Paise, CurrencyType } from './types';

export type TransferStatus =
  | 'PENDING'
  | 'DEBITING'
  | 'CREDITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSING'
  | 'REVERSED';

export interface Transfer {
  id: ULID;
  idempotencyKey: string;
  fromAccountId: ULID;
  toAccountId: ULID;
  amountPaise: Paise;
  currency: CurrencyType;
  status: TransferStatus;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}
