import type { ULID, Paise, CurrencyType, TransferStatus } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface TransferInitiatedEventData {
  transferId: ULID;
  fromAccountId: ULID;
  toAccountId: ULID;
  amountPaise: Paise;
  currency: CurrencyType;
  idempotencyKey: string;
}

export interface TransferStateTransitionEventData {
  transferId: ULID;
  oldStatus: TransferStatus;
  newStatus: TransferStatus;
  failureReason?: string;
}

// Strictly typed structural envelopes
export type TransferInitiatedEvent = EventEnvelope<TransferInitiatedEventData>;
export type TransferStateTransitionEvent = EventEnvelope<TransferStateTransitionEventData>;
