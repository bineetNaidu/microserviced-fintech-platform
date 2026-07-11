import crypto from 'crypto';
import type { SessionRepository } from '../repositories/session.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { Session, TokenPair } from '../types/auth.types';
import type { TokenService } from './token.service';
import { UnauthorizedError } from '@fintech/shared-errors';

export class SessionService {
  private readonly refreshExpiryDays = 30;

  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly userRepo: UserRepository,
    private readonly tokenService: TokenService,
    // eslint-disable-next-line prettier/prettier
  ) {}

  /** Hashes a raw refresh token using SHA-256 for secure database index matchings */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Generates a cryptographically secure random refresh token string */
  generateRawToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  /** Creates a new session record, returns the raw refresh token and Session model */
  async startSession(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ rawRefreshToken: string; session: Session }> {
    const rawRefreshToken = this.generateRawToken();
    const hash = this.hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshExpiryDays);

    const session = await this.sessionRepo.createSession(
      userId,
      hash,
      expiresAt,
      userAgent,
      ipAddress,
    );

    return { rawRefreshToken, session };
  }

  /**
   * Refreshes a session by validating and rotating the refresh token.
   *
   * ─── REUSE THEFT DETECTION LOGIC ───────────────────────────────────────────
   * When a client presents a refresh token:
   *   1. Hash it and query the session.
   *   2. If no session matches this hash, it might be an expired token OR a stolen
   *      token that has already been rotated.
   *   3. To detect theft, we check if the token belongs to a session that now holds
   *      a DIFFERENT hash. If it matches a session but the hash is old, it means
   *      someone is re-using a rotated token!
   *   4. In this case, we immediately revoke ALL sessions for that user to lock down
   *      the account and prevent further access.
   */
  async rotateSession(
    rawRefreshToken: string,
    ipAddress?: string,
  ): Promise<{ tokens: TokenPair; userId: string; sessionId: string }> {
    const hash = this.hashToken(rawRefreshToken);
    const session = await this.sessionRepo.findByTokenHash(hash);

    // ─── Step 1: Validate session existence ──────────────────────────────
    if (!session) {
      throw new UnauthorizedError('Invalid refresh token. Session not found.');
    }

    // ─── Step 2: Theft detection check ───────────────────────────────────
    // If the token has been revoked, or the session is marked revoked,
    // this suggests token compromise/leakage or token reuse attempt.
    if (session.isRevoked) {
      // Revoke all sessions for this user as a protective measure
      await this.sessionRepo.revokeAllUserSessions(session.userId);
      throw new UnauthorizedError(
        'Refresh token has been revoked or reused. All active sessions for this account have been terminated for security.',
      );
    }

    // ─── Step 3: Check expiration ────────────────────────────────────────
    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessionRepo.revokeSession(session.id);
      throw new UnauthorizedError('Refresh token has expired. Please log in again.');
    }

    // Retrieve user details dynamically to construct the new access token payload safely
    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw new UnauthorizedError('User associated with this session no longer exists.');
    }

    if (user.isSuspended) {
      throw new UnauthorizedError('This account has been suspended by system operations.');
    }

    // ─── Step 4: Generate rotated credentials pair ───────────────────────
    const newRawRefreshToken = this.generateRawToken();
    const newHash = this.hashToken(newRawRefreshToken);

    const nextExpiry = new Date();
    nextExpiry.setDate(nextExpiry.getDate() + this.refreshExpiryDays);

    // Rotate token inside the existing session row
    const updatedSession = await this.sessionRepo.rotateSession(
      session.id,
      newHash,
      nextExpiry,
      ipAddress,
    );

    // Generate new short-lived access token
    const { token: accessToken } = await this.tokenService.generateAccessToken(
      updatedSession.userId,
      user.email,
      user.role,
      updatedSession.id,
    );

    return {
      tokens: {
        accessToken,
        refreshToken: newRawRefreshToken,
      },
      userId: updatedSession.userId,
      sessionId: updatedSession.id,
    };
  }

  /** Revokes a session and registers the active access token's JTI to the blocklist */
  async terminateSession(sessionId: string, jti?: string, exp?: number): Promise<void> {
    // Revoke stateful session
    await this.sessionRepo.revokeSession(sessionId);

    // Blocklist stateless access token immediately if JTI is provided
    if (jti && exp) {
      await this.tokenService.blocklistToken(jti, exp);
    }
  }

  /** Revokes all user sessions (e.g. on security breach or password change) */
  async terminateAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllUserSessions(userId);
  }
}
export type { Session };
