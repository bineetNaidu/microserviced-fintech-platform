import type { ULID, UUID, CurrencyType } from './types';

export type AccountType = 'CHECKING' | 'SAVINGS' | 'SUSPENSE';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

/**
 * Represents a core financial account rule entity within the platform.
 * NOTE: This entity tracks configurations, limits, and routing keys.
 * Absolute monetary balances are never stored directly on this mutable record (rely on Ledger entries).
 */
export interface Account {
  /** 26-character time-sortable alphanumeric primary key identifier */
  id: ULID;

  /** Foreign key cross-reference tracking user profile ownership in user-service */
  userId: UUID;

  /** Categorizes structural operational constraints (e.g., CHECKING, SAVINGS) */
  type: AccountType;

  /** Compliance lifecycle state. Mutations are blocked if state != 'ACTIVE' */
  status: AccountStatus;

  /** ISO 4217 currency specification parameter mapping ledger balances */
  currency: CurrencyType;

  /** Chronological creation record tracking when the account was initialized */
  createdAt: Date;

  /** Chronological marker detailing when the account settings were last modified */
  updatedAt: Date;
}
