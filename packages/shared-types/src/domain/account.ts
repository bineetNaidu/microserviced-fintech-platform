import type { ULID } from './types';

export type AccountType = 'CHECKING' | 'SAVINGS' | 'SUSPENSE';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface Account {
  id: ULID; // ULID
  userId: ULID; // ULID
  type: AccountType;
  status: AccountStatus;
  createdAt: Date;
  updatedAt: Date;
}
