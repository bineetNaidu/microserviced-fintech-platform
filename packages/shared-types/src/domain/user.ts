import type { UUID } from './types';

/**
 * Platform Architectural User Access Authorization Roles.
 * Dictates administrative boundaries across the microservice mesh.
 */
export type UserRole = 'CUSTOMER' | 'MAKER' | 'CHECKER' | 'OPERATIONS' | 'AUDITOR';

/**
 * Definitive Know Your Customer (KYC) Lifecycle States.
 */
export type KycStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

/**
 * Locale, timezone, and notification configurations for a user.
 */
export interface UserPreferences {
  language: string;
  timezone: string;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  transferNotificationThreshold: number;
}

export interface UserProfile {
  /** Matches the core auth entry identifier exactly */
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  kycStatus: KycStatus;
  kycVerifiedAt: Date | null;
  kycVerifiedBy: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  preferences: UserPreferences | null;
}
