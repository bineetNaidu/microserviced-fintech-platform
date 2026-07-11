import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Session } from '../types/auth.types';

export class SessionRepository {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  /** Maps raw session record outputs to domain type definitions */
  private toSession(row: typeof schema.sessions.$inferSelect): Session {
    return {
      id: row.id,
      userId: row.userId,
      refreshTokenHash: row.refreshTokenHash,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      isRevoked: row.isRevoked,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    };
  }

  /** Creates a new active user session row */
  async createSession(
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<Session> {
    const results = await this.db
      .insert(schema.sessions)
      .values({
        userId,
        refreshTokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      })
      .returning();

    return this.toSession(results[0]);
  }

  /** Finds a session by its unique ID */
  async findById(id: string): Promise<Session | null> {
    const results = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }
    return this.toSession(results[0]);
  }

  /** Finds a session by its token hash mapping */
  async findByTokenHash(refreshTokenHash: string): Promise<Session | null> {
    const results = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);

    if (results.length === 0) {
      return null;
    }
    return this.toSession(results[0]);
  }

  /** Lists active (unrevoked and unexpired) sessions for a user */
  async findActiveByUserId(userId: string): Promise<Session[]> {
    const results = await this.db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), eq(schema.sessions.isRevoked, false)));

    return results.map((row) => this.toSession(row));
  }

  /** Rotates an existing active session with a new refresh token and expiry date */
  async rotateSession(
    sessionId: string,
    newRefreshTokenHash: string,
    expiresAt: Date,
    ipAddress?: string,
  ): Promise<Session> {
    const results = await this.db
      .update(schema.sessions)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        expiresAt,
        ipAddress,
        lastUsedAt: new Date(),
      })
      .where(eq(schema.sessions.id, sessionId))
      .returning();

    return this.toSession(results[0]);
  }

  /** Revokes a session via its session ID token */
  async revokeSession(id: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ isRevoked: true })
      .where(eq(schema.sessions.id, id));
  }

  /** Revokes all sessions belonging to a specific user */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.db
      .update(schema.sessions)
      .set({ isRevoked: true })
      .where(eq(schema.sessions.userId, userId));
  }
}
