import type { UUID } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface UserRegisteredEventData {
  userId: UUID;
  email: string;
  fullName: string;
  phoneNumber: string;
  timestamp: Date;
}

export interface UserKycStatusChangedEventData {
  userId: UUID;
  oldStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  newStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  verifiedBy?: UUID; // Admin checker UUID
}

// Envelopes
export type UserRegisteredEvent = EventEnvelope<UserRegisteredEventData>;
export type UserKycStatusChangedEvent = EventEnvelope<UserKycStatusChangedEventData>;
