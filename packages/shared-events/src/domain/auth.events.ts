import type { UUID } from '@fintech/shared-types';
import type { EventEnvelope } from '../envelope';

export interface AuthLoginSucceededEventData {
  userId: UUID;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
}

export interface AuthLoginFailedEventData {
  email: string; // Target email input attempted
  reason: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'MFA_FAILED';
  ipAddress: string;
  userAgent: string;
}

export interface AuthTokenRevokedEventData {
  userId: UUID;
  reason: 'LOGOUT' | 'SECURITY_BREACH_RESET' | 'SESSION_EXPIRED';
  tokenId: string;
}

// Envelopes
export type AuthLoginSucceededEvent = EventEnvelope<AuthLoginSucceededEventData>;
export type AuthLoginFailedEvent = EventEnvelope<AuthLoginFailedEventData>;
export type AuthTokenRevokedEvent = EventEnvelope<AuthTokenRevokedEventData>;
