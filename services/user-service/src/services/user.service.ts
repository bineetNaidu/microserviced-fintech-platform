import type { UserRepository } from '../repositories/user.repository';
import type { KycRepository, KycSubmissionDomain } from '../repositories/kyc.repository';
import type { UserPublisher } from '../events/publishers/user.publisher';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { NotFoundError, ForbiddenError } from '@fintech/shared-errors';
import type { KycStatus, UserProfile } from '@fintech/shared-types';

export class UserService {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly userRepo: UserRepository,
    private readonly kycRepo: KycRepository,
    private readonly publisher: UserPublisher,
  ) {}

  /**
   * Retrieves the profile (including preferences) for a user.
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.userRepo.findById(userId);
    if (!profile) {
      throw new NotFoundError('User profile not found.');
    }
    return profile;
  }

  /**
   * Updates user profile and preferences.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateProfile(userId: string, updates: any): Promise<UserProfile> {
    const profile = await this.userRepo.findById(userId);
    if (!profile) {
      throw new NotFoundError('User profile not found.');
    }
    return this.userRepo.updateProfile(userId, updates);
  }

  /**
   * Creates a new KYC document submission and transitions the profile status to SUBMITTED.
   */
  async submitKyc(
    userId: string,
    documentType: string,
    documentNumber: string,
    documentReference: string | undefined,
    correlationId: string,
  ): Promise<KycSubmissionDomain> {
    return this.db.transaction(async (tx) => {
      const profile = await this.userRepo.findById(userId, tx);
      if (!profile) {
        throw new NotFoundError('User profile not found.');
      }

      if (!profile.isActive) {
        throw new ForbiddenError('Inactive profiles cannot submit KYC documents.');
      }

      const oldStatus = profile.kycStatus;

      // 1. Create the submission record
      const submission = await this.kycRepo.createSubmission(
        {
          userId,
          documentType,
          documentNumber,
          documentReference,
        },
        tx,
      );

      // 2. Set profile status to SUBMITTED
      await this.userRepo.updateKycStatus(userId, 'SUBMITTED', undefined, tx);

      // 3. Publish kyc status changed event
      await this.publisher.publishKycStatusChanged(
        userId,
        oldStatus,
        'SUBMITTED',
        'KYC documents submitted for review',
        undefined,
        correlationId,
      );

      // 4. Publish document submission event (triggers operations manual review ticket)
      await this.publisher.publishKycSubmitted(userId, documentType, documentNumber, correlationId);

      return submission;
    });
  }

  /**
   * Retrieves the current KYC status and latest submission details.
   */
  async getKycStatus(
    userId: string,
  ): Promise<{ kycStatus: KycStatus; submission: KycSubmissionDomain | null }> {
    const profile = await this.userRepo.findById(userId);
    if (!profile) {
      throw new NotFoundError('User profile not found.');
    }
    const submission = await this.kycRepo.findLatestByUserId(userId);
    return {
      kycStatus: profile.kycStatus,
      submission,
    };
  }
}
