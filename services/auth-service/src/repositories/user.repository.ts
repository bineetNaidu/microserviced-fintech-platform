import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AuthUser } from '../types/auth.types';
import type { UserRole } from '@fintech/shared-types';

export class UserRepository {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  /** Maps raw Drizzle model database output properties to clean AuthUser type objects */
  private toAuthUser(row: typeof schema.users.$inferSelect): AuthUser {
    return {
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      isEmailVerified: row.isEmailVerified,
      isSuspended: row.isSuspended,
      createdAt: row.createdAt,
    };
  }

  /** Finds an active user by their unique email address */
  async findByEmail(email: string): Promise<AuthUser | null> {
    const results = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);

    if (results.length === 0) {
      return null;
    }
    return this.toAuthUser(results[0]);
  }

  /** Finds a user by their UUID */
  async findById(id: string): Promise<AuthUser | null> {
    const results = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);

    if (results.length === 0) {
      return null;
    }
    return this.toAuthUser(results[0]);
  }

  /** Returns password hash of user for login validations */
  async getPasswordHash(email: string): Promise<string | null> {
    const results = await this.db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return results[0].passwordHash;
  }

  /** Creates a new customer registration entry */
  async createUser(
    email: string,
    passwordHash: string,
    role: UserRole = 'CUSTOMER',
  ): Promise<AuthUser> {
    const results = await this.db
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        role,
      })
      .returning();

    return this.toAuthUser(results[0]);
  }

  /** Updates user email verification state */
  async setEmailVerified(id: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ isEmailVerified: true, updatedAt: new Date() })
      .where(eq(schema.users.id, id));
  }

  /** Retrieves failed login count and timestamp for lockout check */
  async getFailedLoginDetails(
    email: string,
  ): Promise<{ attempts: number; lastFailedAt: Date | null } | null> {
    const results = await this.db
      .select({
        attempts: schema.users.failedLoginAttempts,
        lastFailedAt: schema.users.lastFailedLogin,
      })
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);

    if (results.length === 0) {
      return null;
    }
    return {
      attempts: results[0].attempts,
      lastFailedAt: results[0].lastFailedAt,
    };
  }

  /** Increments failed login count for brute force logging */
  async incrementFailedLogins(email: string): Promise<number> {
    const results = await this.db
      .select({ failedLoginAttempts: schema.users.failedLoginAttempts })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (results.length === 0) {
      return 0;
    }

    const newAttempts = results[0].failedLoginAttempts + 1;

    await this.db
      .update(schema.users)
      .set({
        failedLoginAttempts: newAttempts,
        lastFailedLogin: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.email, email));

    return newAttempts;
  }

  /** Resets failed login attempts back to 0 on successful validation */
  async resetFailedLogins(email: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({
        failedLoginAttempts: 0,
        lastFailedLogin: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.email, email));
  }

  /** Updates password hash (e.g. password resets/changes) */
  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        lastFailedLogin: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id));
  }

  /** Suspends or unsuspends users based on operations inputs */
  async setSuspendedStatus(id: string, isSuspended: boolean): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ isSuspended, updatedAt: new Date() })
      .where(eq(schema.users.id, id));
  }

  /** Soft deletes users from query visibility scopes */
  async softDelete(id: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, id));
  }
}
export type { AuthUser };
