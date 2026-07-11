import crypto from 'crypto';
import type { UserRepository } from '../repositories/user.repository';
import type { TokenRepository } from '../repositories/token.repository';
import type { SessionService } from './session.service';
import type { TokenService } from './token.service';
import type { PasswordService } from './password.service';
import type { AuthPublisher } from '../events/publishers/auth.publisher';
import type { TokenPair, AuthUser } from '../types/auth.types';
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
} from '@fintech/shared-errors';

export class AuthService {
  private readonly tokenExpiryHours = 24; // Email tokens valid for 24h
  private readonly resetExpiryHours = 1; // Reset tokens valid for 1h

  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly publisher: AuthPublisher,
    // eslint-disable-next-line prettier/prettier
  ) {}

  /** Hashes a token using SHA-256 for lookup matching */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Generates a cryptographically secure random token string */
  private generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** Registers a new user account, generates email verification tokens, and publishes user.registered */
  async register(email: string, password: string, correlationId: string): Promise<AuthUser> {
    // ─── Step 1: Check duplicate emails ───────────────────────────────────
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email address is already registered on this platform.');
    }

    // ─── Step 2: Hash password ───────────────────────────────────────────
    const passwordHash = await this.passwordService.hash(password);
    const user = await this.userRepo.createUser(email, passwordHash, 'CUSTOMER');

    // ─── Step 3: Generate and store verification token ────────────────────
    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.tokenExpiryHours);

    await this.tokenRepo.createEmailVerificationToken(user.id, tokenHash, expiresAt);

    // ─── Step 4: Publish event ───────────────────────────────────────────
    await this.publisher.publishUserRegistered(
      user.id,
      user.email,
      user.role,
      rawToken, // Publish raw token so the notification service can embed it in verification link
      correlationId,
    );

    return user;
  }

  /** Verifies a user email via token */
  async verifyEmail(rawToken: string, correlationId: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const verificationRecord = await this.tokenRepo.findActiveEmailToken(tokenHash);

    if (!verificationRecord) {
      throw new BadRequestError('Invalid or already-used email verification token.');
    }

    if (verificationRecord.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError(
        'Verification token has expired. Please request a new registration.',
      );
    }

    // Mark email verified and disable token
    await this.userRepo.setEmailVerified(verificationRecord.userId);
    await this.tokenRepo.markEmailTokenAsUsed(verificationRecord.id);

    const user = await this.userRepo.findById(verificationRecord.userId);
    if (user) {
      await this.publisher.publishEmailVerified(user.id, user.email, correlationId);
    }
  }

  /** Authenticates user credentials, registers a session, and publishes user.logged_in */
  async login(
    email: string,
    password: string,
    userAgent: string | null,
    ipAddress: string | null,
    correlationId: string,
  ): Promise<{ tokens: TokenPair; user: AuthUser }> {
    const user = await this.userRepo.findByEmail(email);

    // If user not found, throw generic invalid credentials (prevents username enumeration)
    if (!user) {
      throw new UnauthorizedError('Invalid email address or password.');
    }

    // ─── Step 1: Check suspension status ─────────────────────────────────
    if (user.isSuspended) {
      throw new ForbiddenError(
        'This account has been suspended by system operations. Contact support.',
      );
    }

    // ─── Step 2: Check failed login lockout ──────────────────────────────
    // 5 attempts limit, if failed within 15 minutes, block login
    const lockoutDetails = await this.userRepo.getFailedLoginDetails(email);
    if (lockoutDetails && lockoutDetails.attempts >= 5 && lockoutDetails.lastFailedAt) {
      const lockWindowMs = 15 * 60 * 1000; // 15 minutes lockout
      const timeSinceLastFailed = Date.now() - lockoutDetails.lastFailedAt.getTime();
      if (timeSinceLastFailed < lockWindowMs) {
        const remainingMinutes = Math.ceil((lockWindowMs - timeSinceLastFailed) / 60000);
        throw new ForbiddenError(
          `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
        );
      }
    }

    // ─── Step 3: Validate password hash ──────────────────────────────────
    const passwordHash = await this.userRepo.getPasswordHash(email);
    const isValid = passwordHash
      ? await this.passwordService.verify(password, passwordHash)
      : false;

    if (!isValid) {
      // Increment failed count
      await this.userRepo.incrementFailedLogins(email);
      throw new UnauthorizedError('Invalid email address or password.');
    }

    // ─── Step 4: Verify email activation status ──────────────────────────
    if (!user.isEmailVerified) {
      throw new ForbiddenError(
        'Email address is not verified. Check your inbox for the verification link.',
      );
    }

    // Password is valid -> reset failed attempts
    await this.userRepo.resetFailedLogins(email);

    // ─── Step 5: Start refresh token session ──────────────────────────────
    const { rawRefreshToken, session } = await this.sessionService.startSession(
      user.id,
      userAgent ?? undefined,
      ipAddress ?? undefined,
    );

    // ─── Step 6: Generate stateless access token ─────────────────────────
    const { token: accessToken } = await this.tokenService.generateAccessToken(
      user.id,
      user.email,
      user.role,
      session.id,
    );

    // ─── Step 7: Emit audit logging event ─────────────────────────────────
    await this.publisher.publishLoggedIn(user.id, session.id, ipAddress, userAgent, correlationId);

    return {
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
      },
      user,
    };
  }

  /** Logs out a session, revokes refresh token, blocklists access token, publishes user.session_revoked */
  async logout(
    sessionId: string,
    userId: string,
    jti: string,
    exp: number,
    correlationId: string,
  ): Promise<void> {
    await this.sessionService.terminateSession(sessionId, jti, exp);

    await this.publisher.publishSessionRevoked(
      userId,
      sessionId,
      false, // revokedAll = false
      correlationId,
    );
  }

  /** Handles forgot-password query. Prevents email enumeration by returning silently if not found */
  async forgotPassword(email: string, correlationId: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      return; // Silent return (security constraint)
    }

    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.resetExpiryHours);

    await this.tokenRepo.createPasswordResetToken(user.id, tokenHash, expiresAt);

    await this.publisher.publishPasswordResetRequested(
      user.id,
      user.email,
      rawToken, // Broadcast raw token for notification mailer routing
      correlationId,
    );
  }

  /** Validates reset token, updates password, revokes all user sessions, and publishes user.password_changed */
  async resetPassword(rawToken: string, newPassword: string, correlationId: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const resetRecord = await this.tokenRepo.findActivePasswordResetToken(tokenHash);

    if (!resetRecord) {
      throw new BadRequestError('Invalid or already-used password reset token.');
    }

    if (resetRecord.expiresAt.getTime() < Date.now()) {
      throw new BadRequestError('Password reset token has expired. Request a new link.');
    }

    const user = await this.userRepo.findById(resetRecord.userId);
    if (!user) {
      throw new BadRequestError('User not found.');
    }

    // Hash new password
    const newPasswordHash = await this.passwordService.hash(newPassword);

    // Update password and reset logins
    await this.userRepo.updatePassword(user.id, newPasswordHash);
    await this.tokenRepo.markPasswordTokenAsUsed(resetRecord.id);

    // Revoke all sessions (forces re-login across all user devices for security)
    await this.sessionService.terminateAllUserSessions(user.id);

    await this.publisher.publishPasswordChanged(user.id, correlationId);
    await this.publisher.publishSessionRevoked(user.id, 'all', true, correlationId);
  }
}
