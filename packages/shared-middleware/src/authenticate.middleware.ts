import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';
import { UnauthorizedError, ForbiddenError } from '@fintech/shared-errors';
import type { UserRole } from '@fintech/shared-types';

/**
 * Authenticated user context extracted from a verified JWT and attached to req.user.
 * Populated by createAuthenticateMiddleware() and read by requireRole() and controllers.
 */
export interface AuthenticatedUser {
  /** The user's UUID — maps to the user profile in the User Service */
  id: string;
  /** Verified email address from the JWT claims */
  email: string;
  /**
   * The user's role — determines which service boundaries they can cross.
   * Validated against the known UserRole union at token verification time.
   */
  role: UserRole;
  /**
   * Fine-grained action permissions for MAKER/CHECKER administrative flows.
   * Example: ['LIMIT_OVERRIDE', 'ACCOUNT_UNFREEZE'] for a MAKER user.
   * Empty array for CUSTOMER and AUDITOR roles.
   */
  permissions: string[];
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      /**
       * Populated by createAuthenticateMiddleware() after successful JWT verification.
       * Undefined on unauthenticated routes (health checks, public endpoints).
       * Always defined on routes guarded by authenticate + requireRole middleware chain.
       */
      user?: AuthenticatedUser;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

/**
 * JWT payload shape expected inside every access token issued by the Auth Service.
 * Extends jose's base JWTPayload which includes standard registered claims (exp, iat, sub, etc.)
 */
interface AppJWTPayload extends JWTPayload {
  sub: string; // User UUID
  email: string;
  role: UserRole;
  permissions: string[];
}

/**
 * Set of valid UserRole values for runtime validation of JWT role claims.
 * Must stay in sync with the UserRole type in @fintech/shared-types.
 *
 * WHY A SET INSTEAD OF CHECKING THE TYPE DIRECTLY?
 * TypeScript types are erased at runtime — there is no `isUserRole()` type guard
 * available at runtime. A Set gives us O(1) membership checking against the known
 * valid values without a runtime dependency on the type system.
 */
const VALID_ROLES = new Set<string>(['CUSTOMER', 'MAKER', 'CHECKER', 'OPERATIONS', 'AUDITOR']);

/**
 * Factory that creates the JWT Authentication Middleware for a specific service instance.
 *
 * ─── WHY A FACTORY INSTEAD OF DIRECT MIDDLEWARE? ─────────────────────────────
 * Each service has its own JWT secret stored in its environment config (JWT_SECRET env var).
 * Exporting a bare middleware would require reading process.env at module load time,
 * which breaks testability (you cannot inject a test secret). A factory accepts the
 * secret explicitly and closes over it, creating a testable, predictable middleware.
 *
 * ─── WHY JOSE INSTEAD OF JSONWEBTOKEN? ───────────────────────────────────────
 * `jsonwebtoken` (the older library) has known security issues:
 *   • Accepts `algorithm: 'none'` if not explicitly blocked — allows signature bypass
 *   • Synchronous API — blocks the event loop for large tokens
 *   • CommonJS only — incompatible with modern ESM-first runtimes
 *
 * `jose` (the modern library) is:
 *   • Async by default — non-blocking JWT verification
 *   • Secure defaults — no algorithm confusion attacks out of the box
 *   • Standards-compliant — works across Node.js, Deno, Cloudflare Workers, browsers
 *   • Full TypeScript types — no @types/jose needed
 *
 * ─── ALGORITHM: HS256 (HMAC-SHA256) ─────────────────────────────────────────
 * We use a symmetric shared secret because the Auth Service is the only token issuer
 * and other services only verify. HS256 is simpler to set up than RS256 (asymmetric).
 * If you later need a public JWKS endpoint (e.g., for 3rd-party integrations or to
 * rotate keys without redeploying all services), migrate to RS256 or ES256.
 *
 * @param jwtSecret - The HS256 signing secret from the service config (e.g., config.JWT_SECRET)
 * @returns Express middleware that validates Bearer tokens and populates req.user
 *
 * @example
 * // In service app.ts setup:
 * import { createAuthenticateMiddleware } from '@fintech/shared-middleware';
 * const authenticate = createAuthenticateMiddleware(config.JWT_SECRET);
 * app.use('/v1/transfers', authenticate, transferRoutes);
 */
export function createAuthenticateMiddleware(jwtSecret: string): RequestHandler {
  /**
   * Pre-encode the secret ONCE at startup (not on every request).
   * jose requires a Uint8Array for HMAC keys.
   * TextEncoder converts the UTF-8 string secret into bytes.
   * Doing this at factory call time avoids re-encoding on every HTTP request.
   */
  const secretKey = new TextEncoder().encode(jwtSecret);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    // ─── Step 1: Extract Bearer token from Authorization header ────────────
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(
        new UnauthorizedError(
          'Missing or malformed Authorization header. Expected format: Bearer <token>',
        ),
      );
    }

    // Slice off the "Bearer " prefix (7 characters) to get the raw token string
    const token = authHeader.slice(7);

    try {
      // ─── Step 2: Verify JWT signature and standard registered claims ──────
      //
      // jwtVerify() automatically validates:
      //   • Signature integrity (tamper detection) — throws JWSSignatureVerificationFailed
      //   • Expiry (exp claim) — throws JWTExpired if token is past expiry
      //   • Not-before (nbf claim) if present — throws JWTClaimValidationFailed
      //   • Algorithm enforcement — only HS256 accepted (rejects RS256, 'none', etc.)
      //
      // We do NOT need to manually check exp or iat — jose handles this.
      const { payload } = await jwtVerify<AppJWTPayload>(token, secretKey, {
        algorithms: ['HS256'],
      });

      // ─── Step 3: Validate required application-specific claims are present ─
      //
      // jose validates standard claims but NOT our custom claims (sub, email, role, permissions).
      // We must check these manually. Missing claims = malformed token from our Auth Service.
      if (!payload.sub || !payload.email || !payload.role || !Array.isArray(payload.permissions)) {
        return next(
          new UnauthorizedError(
            'Token payload is missing required claims (sub, email, role, permissions). ' +
              'This indicates a token generated by an incompatible Auth Service version.',
          ),
        );
      }

      // ─── Step 4: Validate the role is a known UserRole value ──────────────
      //
      // Guards against tokens with tampered or stale role values.
      // Example scenario: a CUSTOMER token where `role` has been set to 'ADMIN' via
      // a forged token — this check would catch it even if the signature verified
      // (which it wouldn't, but defense-in-depth applies).
      if (!VALID_ROLES.has(payload.role)) {
        return next(
          new ForbiddenError(
            `Token contains an unrecognized role: '${payload.role}'. ` +
              'Valid roles: CUSTOMER, MAKER, CHECKER, OPERATIONS, AUDITOR.',
          ),
        );
      }

      // ─── Step 5: Populate req.user for downstream middleware/controllers ───
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions,
      };

      next();
    } catch (error: unknown) {
      // Map jose-specific errors to application errors with clear, safe messages.
      // We intentionally do NOT forward the raw jose error message to the client —
      // it may contain internal implementation details (key material info, algorithm names)
      // that could assist an attacker. Log the raw error server-side only.
      if (error instanceof Error) {
        const { name } = error;

        if (name === 'JWTExpired') {
          return next(
            new UnauthorizedError(
              'Access token has expired. Please log in again to get a fresh token.',
            ),
          );
        }

        if (
          name === 'JWSSignatureVerificationFailed' ||
          name === 'JWTInvalid' ||
          name === 'JWSInvalid'
        ) {
          return next(
            new UnauthorizedError(
              'Token signature is invalid or has been tampered with. Authentication rejected.',
            ),
          );
        }

        if (name === 'JWTClaimValidationFailed') {
          return next(new UnauthorizedError('Token contains invalid or missing standard claims.'));
        }
      }

      // Unknown/unexpected error — surface safely without leaking internals
      return next(
        new UnauthorizedError('Authentication failed due to an unexpected verification error.'),
      );
    }
  };
}
