import type { UUID } from './types';

export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'suspended';

export interface UserProfile {
  /** Matches the core auth entry identifier exactly */
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  kycStatus: KycStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
