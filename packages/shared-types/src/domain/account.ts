import type { ULID, CurrencyType } from './types';

export type AccountType = 'CHECKING' | 'SAVINGS' | 'SUSPENSE';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface Account {
  id: ULID;
  userId: ULID;
  type: AccountType;
  status: AccountStatus;
  currency: CurrencyType;
  createdAt: Date;
  updatedAt: Date;
}
