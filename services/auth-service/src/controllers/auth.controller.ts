import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../services/auth.service';
import type { SessionService } from '../services/session.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '@fintech/shared-errors';
import { ApiRoutes } from '@fintech/shared-config';

export class AuthController {
  private readonly cookieName = 'refreshToken';
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  /** Sets HttpOnly secure cookie for the refresh token rotate loop */
  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: this.isProduction, // HTTPS required in production
      sameSite: 'lax',
      path: ApiRoutes.ApiPrefixes.Auth, // Restrict cookie transport solely to auth paths
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  /** Clears the refresh token cookie on logout */
  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: ApiRoutes.ApiPrefixes.Auth,
    });
  }

  /** Registers a new user account */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const correlationId = req.correlationId!;

      await this.authService.register(email, password, correlationId);

      res.status(201).json({
        success: true,
        data: {
          message: 'Registration successful. Please verify your email address to log in.',
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Verifies email address activation link */
  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body;
      const correlationId = req.correlationId!;

      await this.authService.verifyEmail(token, correlationId);

      res.status(200).json({
        success: true,
        data: {
          message: 'Email address verified successfully. You can now log in.',
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Authenticates user login credentials, sets HttpOnly cookie, returns accessToken */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const userAgent = req.headers['user-agent'] || null;
      const ipAddress =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
      const correlationId = req.correlationId!;

      const { tokens, user } = await this.authService.login(
        email,
        password,
        userAgent,
        ipAddress,
        correlationId,
      );

      this.setRefreshCookie(res, tokens.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Refreshes expired access tokens, rotates refresh cookie */
  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawRefreshToken = req.cookies[this.cookieName] || req.body.refreshToken;
      const ipAddress =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;

      if (!rawRefreshToken) {
        throw new BadRequestError('Missing refresh token credentials.');
      }

      const { tokens } = await this.sessionService.rotateSession(rawRefreshToken, ipAddress!);

      this.setRefreshCookie(res, tokens.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
        },
        meta: null,
      });
    } catch (error) {
      this.clearRefreshCookie(res);
      next(error);
    }
  };

  /** Logs out a session, revokes refresh token, blocklists access token */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawRefreshToken = req.cookies[this.cookieName];
      const user = req.user; // Set by authenticate middleware
      const correlationId = req.correlationId!;

      if (!user) {
        throw new BadRequestError('User authentication context is required for logout.');
      }

      // Extract JTI claims from verification headers (passed into middleware request object)
      const authHeader = req.headers.authorization;
      let jti: string | undefined;
      let exp: number | undefined;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const payloadStr = Buffer.from(token.split('.')[1], 'base64').toString('utf-8');
          const payload = JSON.parse(payloadStr);
          jti = payload.jti;
          exp = payload.exp;
        } catch {
          // Ignore
        }
      }

      // Terminate session
      if (rawRefreshToken) {
        const hash = this.sessionService.hashToken(rawRefreshToken);
        const session = await this.sessionService['sessionRepo'].findByTokenHash(hash);
        if (session && session.userId === user.id) {
          await this.authService.logout(session.id, user.id, jti || '', exp || 0, correlationId);
        }
      } else {
        // Fallback: lookup session using session ID in JWT payload
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.slice(7);
            const payload = JSON.parse(
              Buffer.from(token.split('.')[1], 'base64').toString('utf-8'),
            );
            if (payload.sessionId) {
              await this.authService.logout(
                payload.sessionId,
                user.id,
                jti || '',
                exp || 0,
                correlationId,
              );
            }
          } catch {
            // Ignore
          }
        }
      }

      this.clearRefreshCookie(res);

      res.status(200).json({
        success: true,
        data: {
          message: 'Logged out successfully.',
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Initiates forgot-password process */
  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;
      const correlationId = req.correlationId!;

      await this.authService.forgotPassword(email, correlationId);

      // Return 200 regardless of email match to prevent enumeration scan attacks
      res.status(200).json({
        success: true,
        data: {
          message:
            'If that email address exists in our system, a password reset link has been sent.',
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Resets password using verification token */
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, password } = req.body;
      const correlationId = req.correlationId!;

      await this.authService.resetPassword(token, password, correlationId);

      res.status(200).json({
        success: true,
        data: {
          message:
            'Password reset successfully. All active sessions have been terminated. Please log in.',
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Lists active session sessions for the current authenticated user */
  getSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        throw new BadRequestError('User context is required.');
      }

      const activeSessions = await this.sessionService['sessionRepo'].findActiveByUserId(user.id);

      res.status(200).json({
        success: true,
        data: {
          sessions: activeSessions.map((s) => ({
            id: s.id,
            device: s.userAgent || 'unknown device',
            ip: s.ipAddress || 'unknown',
            createdAt: s.createdAt,
            lastUsedAt: s.lastUsedAt,
          })),
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };

  /** Revokes a specific active session */
  revokeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const user = req.user;
      const correlationId = req.correlationId!;

      if (!user) {
        throw new BadRequestError('User context is required.');
      }

      const session = await this.sessionService['sessionRepo'].findById(sessionId as string);

      if (!session) {
        throw new NotFoundError('Session not found.');
      }

      if (session.userId !== user.id) {
        throw new ForbiddenError('You are not authorized to revoke this session.');
      }

      await this.authService.logout(
        session.id,
        user.id,
        '', // We don't have access token details here
        0,
        correlationId,
      );

      res.status(200).json({
        success: true,
        data: {
          message: 'Session revoked successfully.',
        },
        meta: null,
      });
    } catch (error) {
      next(error);
    }
  };
}
