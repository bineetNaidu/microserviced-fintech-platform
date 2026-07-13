import type { Request, Response, NextFunction } from 'express';
import type { UserService } from '../services/user.service';
import { UnauthorizedError } from '@fintech/shared-errors';
import type { UserProfile } from '@fintech/shared-types';

export class UserController {
  constructor(private readonly userService: UserService) {}

  /** Formats user profile payload to satisfy both the manual and frontend formats */
  private formatProfileResponse(profile: UserProfile) {
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phoneNumber: profile.phoneNumber, // TS / frontend spec
      kycStatus: profile.kycStatus,
      isActive: profile.isActive,
      preferences: profile.preferences
        ? {
            language: profile.preferences.language,
            timezone: profile.preferences.timezone,
            emailNotificationsEnabled: profile.preferences.emailNotificationsEnabled,
            smsNotificationsEnabled: profile.preferences.smsNotificationsEnabled,
            pushNotificationsEnabled: profile.preferences.pushNotificationsEnabled,
            transferNotificationThreshold: profile.preferences.transferNotificationThreshold,
          }
        : null,
    };
  }

  /** GET /v1/profile & GET /v1/users/me */
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        throw new UnauthorizedError('User authentication headers missing.');
      }

      const profile = await this.userService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: this.formatProfileResponse(profile),
        meta: null,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** PATCH /v1/profile/update & PATCH /v1/users/me & POST /v1/profile/create */
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Identity Extraction Guard: Ignore body userId, read solely from edge gateway header
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        throw new UnauthorizedError('User authentication headers missing.');
      }

      // Extract only mutable fields as defined in spec
      const {
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        preferences,
      } = req.body;

      const profile = await this.userService.updateProfile(userId, {
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        preferences,
      });

      res.status(200).json({
        success: true,
        data: this.formatProfileResponse(profile),
        meta: null,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** POST /v1/kyc/submit & POST /v1/users/me/kyc-submissions */
  submitKyc = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        throw new UnauthorizedError('User authentication headers missing.');
      }

      const { documentType, documentNumber, documentReference } = req.body;
      const correlationId = req.correlationId!;

      const submission = await this.userService.submitKyc(
        userId,
        documentType,
        documentNumber,
        documentReference,
        correlationId,
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'KYC submission accepted. Review pipeline initiated.',
          submissionId: submission.id,
          status: submission.status,
        },
        meta: null,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /v1/kyc/status */
  getKycStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        throw new UnauthorizedError('User authentication headers missing.');
      }

      const { kycStatus, submission } = await this.userService.getKycStatus(userId);

      res.status(200).json({
        success: true,
        data: {
          kycStatus,
          submission: submission
            ? {
                id: submission.id,
                documentType: submission.documentType,
                status: submission.status,
                rejectionReason: submission.rejectionReason,
                submittedAt: submission.submittedAt,
              }
            : null,
        },
        meta: null,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /v1/users/internal/:userId & GET /v1/internal/:userId */
  internalGetProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;

      const profile = await this.userService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: {
          id: profile.id,
          kycStatus: profile.kycStatus.toLowerCase(), // Return lowercase as described in internal API contract
          isActive: profile.isActive,
        },
        meta: null,
        error: null,
      });
    } catch (error) {
      next(error);
    }
  };
}
