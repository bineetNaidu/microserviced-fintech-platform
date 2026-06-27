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

export interface UserProfile {
  /** Matches the core auth entry identifier exactly */
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  kycStatus: KycStatus;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
