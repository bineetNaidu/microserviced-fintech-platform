import type { ULID, UUID, AccountType, AccountStatus, CurrencyType } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface AccountCreatedEventData {
  accountId: ULID;
  userId: UUID;
  type: AccountType;
  currency: CurrencyType;
  createdAt: Date;
}

export interface AccountStatusChangedEventData {
  accountId: ULID;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
  reason: string;
  updatedBy: UUID | 'SYSTEM';
}

// Strictly typed structural envelopes
export type AccountCreatedEvent = EventEnvelope<AccountCreatedEventData>;
export type AccountStatusChangedEvent = EventEnvelope<AccountStatusChangedEventData>;
