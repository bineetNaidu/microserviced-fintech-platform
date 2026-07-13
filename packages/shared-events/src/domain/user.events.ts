import type { UUID, KycStatus } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface UserRegisteredEventData {
  userId: UUID;
  email: string;
  role: string;
  verificationToken: string;
  occurredAt: string;
}

export interface UserKycStatusChangedEventData {
  userId: UUID;
  /**
   * Full KycStatus union imported from shared-types.
   *
   * FIXED: This previously used an inline union `'PENDING' | 'APPROVED' | 'REJECTED'`
   * which was missing 'SUBMITTED' and 'SUSPENDED'. Those transitions would silently
   * produce a TypeScript error in any consumer listening for those states.
   * Now it correctly mirrors the complete KycStatus type.
   */
  oldStatus: KycStatus;
  newStatus: KycStatus;
  /** Compliance-required reason for the status change — required by regulators for audit */
  reason?: string;
  /** The Admin UUID who performed the KYC verification. Null if system-automated. */
  verifiedBy?: UUID;
}

// Strictly typed structural envelopes
export type UserRegisteredEvent = EventEnvelope<UserRegisteredEventData>;
export type UserKycStatusChangedEvent = EventEnvelope<UserKycStatusChangedEventData>;
