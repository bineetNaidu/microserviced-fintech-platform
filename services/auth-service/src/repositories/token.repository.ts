import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { VerificationToken } from '../types/auth.types';

export class TokenRepository {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private toVerificationToken(
    row: typeof schema.emailVerificationTokens.$inferSelect,
  ): VerificationToken {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      createdAt: row.createdAt,
    };
  }

  // ─── EMAIL VERIFICATION TOKENS ──────────────────────────────────────────────

  /** Creates and returns an email verification token entry */
  async createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<VerificationToken> {
    const results = await this.db
      .insert(schema.emailVerificationTokens)
      .values({
        userId,
        tokenHash,
        expiresAt,
      })
      .returning();

    return this.toVerificationToken(results[0]);
  }

  /** Finds a active email token by its hash string */
  async findActiveEmailToken(tokenHash: string): Promise<VerificationToken | null> {
    const results = await this.db
      .select()
      .from(schema.emailVerificationTokens)
      .where(
        and(
          eq(schema.emailVerificationTokens.tokenHash, tokenHash),
          isNull(schema.emailVerificationTokens.usedAt),
        ),
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.toVerificationToken(results[0]);
  }

  /** Sets email verification token status as used */
  async markEmailTokenAsUsed(tokenId: string): Promise<void> {
    await this.db
      .update(schema.emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.emailVerificationTokens.id, tokenId));
  }

  // ─── PASSWORD RESET TOKENS ──────────────────────────────────────────────────

  /** Creates and returns a password reset token entry */
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<VerificationToken> {
    const results = await this.db
      .insert(schema.passwordResetTokens)
      .values({
        userId,
        tokenHash,
        expiresAt,
      })
      .returning();

    return this.toVerificationToken(results[0]);
  }

  /** Finds an active password reset token by its hash string */
  async findActivePasswordResetToken(tokenHash: string): Promise<VerificationToken | null> {
    const results = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          isNull(schema.passwordResetTokens.usedAt),
        ),
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.toVerificationToken(results[0]);
  }

  /** Sets password reset token status as used */
  async markPasswordTokenAsUsed(tokenId: string): Promise<void> {
    await this.db
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, tokenId));
  }
}
