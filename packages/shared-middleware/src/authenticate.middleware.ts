import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { jwtVerify, importSPKI, type KeyLike, type JWTPayload } from 'jose';
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
 * ─── UPGRADED TO RS256 ASYMMETRIC VERIFICATION (ADR-005) ─────────────────────
 * This middleware has been upgraded from HS256 (symmetric shared secret) to RS256
 * (asymmetric public key). Each service now receives only the RSA PUBLIC KEY —
 * it can verify tokens but CANNOT sign new ones.
 *
 * WHY THIS MATTERS:
 * With HS256, every service shared the same secret. If any one of the 13 services
 * was compromised, the attacker could forge tokens for any user as any role.
 *
 * With RS256, each downstream service holds only the public key:
 *   • The auth service signs tokens with the PRIVATE key (only it can issue tokens)
 *   • All other services verify with the PUBLIC key (they can only check, not forge)
 *   • A compromised service leaks the public key — which is safe to expose publicly anyway
 *
 * ─── WHY A FACTORY INSTEAD OF DIRECT MIDDLEWARE? ─────────────────────────────
 * Each service reads its public key from its own environment config.
 * A factory accepts the key explicitly and closes over it, creating a testable,
 * independently-configurable middleware per service.
 *
 * ─── WHY JOSE INSTEAD OF JSONWEBTOKEN? ───────────────────────────────────────
 * `jsonwebtoken` has known security issues:
 *   • Accepts `algorithm: 'none'` if not explicitly blocked — allows signature bypass
 *   • Synchronous API — blocks the event loop for large tokens
 *   • CommonJS only — incompatible with modern ESM-first runtimes
 *
 * `jose` is:
 *   • Async by default — non-blocking JWT verification
 *   • Secure defaults — no algorithm confusion attacks out of the box
 *   • Standards-compliant — works across Node.js, Deno, Cloudflare Workers, browsers
 *   • Full TypeScript types — no @types/jose needed
 *
 * @param jwtPublicKeyPem - The RSA public key PEM string from the service config (e.g., config.JWT_PUBLIC_KEY)
 * @returns Express middleware that validates Bearer tokens and populates req.user
 *
 * @example
 * // In service app.ts setup:
 * import { createAuthenticateMiddleware } from '@fintech/shared-middleware';
 * const authenticate = createAuthenticateMiddleware(config.JWT_PUBLIC_KEY);
 * app.use('/v1/transfers', authenticate, transferRoutes);
 */
export function createAuthenticateMiddleware(jwtPublicKeyPem: string): RequestHandler {
  /**
   * Pre-import the RSA public key ONCE at factory call time (not on every request).
   * importSPKI() is an async WebCrypto operation — it's expensive enough that doing it
   * per-request would add measurable latency at scale.
   *
   * We use a Promise here because importSPKI is async, but the factory function itself
   * must be synchronous (so it can be called in app.ts setup code). The middleware
   * awaits the promise before verification — it's resolved on the first request at most.
   */
  const publicKeyPromise: Promise<KeyLike> = importSPKI(jwtPublicKeyPem, 'RS256');

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
      // Resolve the pre-imported public key (resolved on first call, cached thereafter)
      const publicKey = await publicKeyPromise;

      // ─── Step 2: Verify JWT signature and standard registered claims ──────
      //
      // jwtVerify() automatically validates:
      //   • Signature integrity (tamper detection) — throws JWSSignatureVerificationFailed
      //   • Algorithm enforcement — only RS256 accepted (rejects HS256, 'none', etc.)
      //   • Expiry (exp claim) — throws JWTExpired if token is past expiry
      //   • Not-before (nbf claim) if present — throws JWTClaimValidationFailed
      //
      // We do NOT need to manually check exp or iat — jose handles this.
      const { payload } = await jwtVerify<AppJWTPayload>(token, publicKey, {
        algorithms: ['RS256'], // Explicit whitelist — prevents algorithm confusion attacks
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
      // Example: a token where `role` has been set to 'ADMIN' via a crafted payload —
      // this check would catch it even if the signature somehow verified.
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
