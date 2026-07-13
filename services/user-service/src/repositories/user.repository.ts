import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, ExtractTablesWithRelations } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { KycStatus } from '@fintech/shared-types';

export type DbKycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'suspended';

export type TransactionContext = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Maps database kyc_status representation to canonical TypeScript KycStatus domain type */
export function toKycStatus(dbStatus: string): KycStatus {
  const map: Record<string, KycStatus> = {
    pending: 'PENDING',
    submitted: 'SUBMITTED',
    verified: 'APPROVED', // 'verified' in DB matches 'APPROVED' in shared-types
    rejected: 'REJECTED',
    suspended: 'SUSPENDED',
  };
  return map[dbStatus] || 'PENDING';
}

/** Maps canonical KycStatus domain type to database kyc_status representation */
export function toDbKycStatus(status: KycStatus): DbKycStatus {
  const map: Record<KycStatus, DbKycStatus> = {
    PENDING: 'pending',
    SUBMITTED: 'submitted',
    APPROVED: 'verified',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended',
  };
  return map[status] || 'pending';
}

export interface UserProfileDomain {
  id: string;
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
  preferences: {
    language: string;
    timezone: string;
    emailNotificationsEnabled: boolean;
    smsNotificationsEnabled: boolean;
    pushNotificationsEnabled: boolean;
    transferNotificationThreshold: number;
  } | null;
}

export class UserRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private getDb(tx?: TransactionContext) {
    return tx || this.db;
  }

  /** Maps raw DB profile and joined preferences to domain representation */
  private toDomain(
    profile: typeof schema.userProfiles.$inferSelect,
    prefs?: typeof schema.userPreferences.$inferSelect | null,
  ): UserProfileDomain {
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phoneNumber: profile.phoneNumber,
      dateOfBirth: profile.dateOfBirth,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      country: profile.country,
      kycStatus: toKycStatus(profile.kycStatus),
      kycVerifiedAt: profile.kycVerifiedAt,
      kycVerifiedBy: profile.kycVerifiedBy,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      preferences: prefs
        ? {
            language: prefs.language,
            timezone: prefs.timezone,
            emailNotificationsEnabled: prefs.emailNotificationsEnabled,
            smsNotificationsEnabled: prefs.smsNotificationsEnabled,
            pushNotificationsEnabled: prefs.pushNotificationsEnabled,
            transferNotificationThreshold: prefs.transferNotificationThreshold,
          }
        : null,
    };
  }

  /** Finds a profile by ID, with preferences joined */
  async findById(id: string, tx?: TransactionContext): Promise<UserProfileDomain | null> {
    const result = await this.getDb(tx).query.userProfiles.findFirst({
      where: and(eq(schema.userProfiles.id, id), isNull(schema.userProfiles.deletedAt)),
      with: {
        preferences: true,
      },
    });

    if (!result) {
      return null;
    }
    return this.toDomain(result, result.preferences);
  }

  /** Finds a profile by email, with preferences joined */
  async findByEmail(email: string, tx?: TransactionContext): Promise<UserProfileDomain | null> {
    const result = await this.getDb(tx).query.userProfiles.findFirst({
      where: and(eq(schema.userProfiles.email, email), isNull(schema.userProfiles.deletedAt)),
      with: {
        preferences: true,
      },
    });

    if (!result) {
      return null;
    }
    return this.toDomain(result, result.preferences);
  }

  /** Creates a user profile record and default preferences in the database */
  async createProfile(
    data: {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
    },
    tx?: TransactionContext,
  ): Promise<UserProfileDomain> {
    const dbContext = this.getDb(tx);

    // Provision user_profiles row
    const [profile] = await dbContext
      .insert(schema.userProfiles)
      .values({
        id: data.id,
        email: data.email,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phoneNumber: data.phoneNumber || null,
        kycStatus: 'pending',
        isActive: true,
      })
      .returning();

    // Provision user_preferences row
    const [prefs] = await dbContext
      .insert(schema.userPreferences)
      .values({
        userId: profile.id,
        language: 'en',
        timezone: 'Asia/Kolkata',
      })
      .returning();

    return this.toDomain(profile, prefs);
  }

  /** Updates user profile and preferences */
  async updateProfile(
    userId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      dateOfBirth?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      preferences?: {
        language?: string;
        timezone?: string;
        emailNotificationsEnabled?: boolean;
        smsNotificationsEnabled?: boolean;
        pushNotificationsEnabled?: boolean;
        transferNotificationThreshold?: number;
      };
    },
    tx?: TransactionContext,
  ): Promise<UserProfileDomain> {
    const dbContext = this.getDb(tx);

    const profileUpdates: Partial<typeof schema.userProfiles.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.firstName !== undefined) {
      profileUpdates.firstName = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      profileUpdates.lastName = updates.lastName;
    }
    if (updates.phoneNumber !== undefined) {
      profileUpdates.phoneNumber = updates.phoneNumber;
    }
    if (updates.dateOfBirth !== undefined) {
      profileUpdates.dateOfBirth = updates.dateOfBirth;
    }
    if (updates.addressLine1 !== undefined) {
      profileUpdates.addressLine1 = updates.addressLine1;
    }
    if (updates.addressLine2 !== undefined) {
      profileUpdates.addressLine2 = updates.addressLine2;
    }
    if (updates.city !== undefined) {
      profileUpdates.city = updates.city;
    }
    if (updates.state !== undefined) {
      profileUpdates.state = updates.state;
    }
    if (updates.postalCode !== undefined) {
      profileUpdates.postalCode = updates.postalCode;
    }
    if (updates.country !== undefined) {
      profileUpdates.country = updates.country;
    }

    // Execute User Profile update
    const [profile] = await dbContext
      .update(schema.userProfiles)
      .set(profileUpdates)
      .where(eq(schema.userProfiles.id, userId))
      .returning();

    let prefs = await dbContext.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });

    if (updates.preferences && prefs) {
      const prefsUpdates: Partial<typeof schema.userPreferences.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (updates.preferences.language !== undefined) {
        prefsUpdates.language = updates.preferences.language;
      }
      if (updates.preferences.timezone !== undefined) {
        prefsUpdates.timezone = updates.preferences.timezone;
      }
      if (updates.preferences.emailNotificationsEnabled !== undefined) {
        prefsUpdates.emailNotificationsEnabled = updates.preferences.emailNotificationsEnabled;
      }
      if (updates.preferences.smsNotificationsEnabled !== undefined) {
        prefsUpdates.smsNotificationsEnabled = updates.preferences.smsNotificationsEnabled;
      }
      if (updates.preferences.pushNotificationsEnabled !== undefined) {
        prefsUpdates.pushNotificationsEnabled = updates.preferences.pushNotificationsEnabled;
      }
      if (updates.preferences.transferNotificationThreshold !== undefined) {
        prefsUpdates.transferNotificationThreshold =
          updates.preferences.transferNotificationThreshold;
      }

      [prefs] = await dbContext
        .update(schema.userPreferences)
        .set(prefsUpdates)
        .where(eq(schema.userPreferences.userId, userId))
        .returning();
    }

    return this.toDomain(profile, prefs);
  }

  /** Updates the KYC status of the user profile record */
  async updateKycStatus(
    userId: string,
    status: KycStatus,
    reviewerId?: string,
    tx?: TransactionContext,
  ): Promise<UserProfileDomain> {
    const dbContext = this.getDb(tx);
    const dbStatus = toDbKycStatus(status);

    const updateFields: Partial<typeof schema.userProfiles.$inferInsert> = {
      kycStatus: dbStatus,
      updatedAt: new Date(),
    };

    if (status === 'APPROVED') {
      updateFields.kycVerifiedAt = new Date();
      updateFields.kycVerifiedBy = reviewerId || null;
    }

    const [profile] = await dbContext
      .update(schema.userProfiles)
      .set(updateFields)
      .where(eq(schema.userProfiles.id, userId))
      .returning();

    const prefs = await dbContext.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });

    return this.toDomain(profile, prefs);
  }
}
