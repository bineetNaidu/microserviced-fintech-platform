import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { jwtVerify, importSPKI, type KeyLike, type JWTPayload } from 'jose';
import { UnauthorizedError } from '@fintech/shared-errors';
import type { UserRole } from '@fintech/shared-types';

/**
 * Gateway-specific JWT payload shape.
 * Mirrors the AppJWTPayload from the auth service — claims must stay in sync.
 */
interface GatewayJWTPayload extends JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  sessionId: string;
  permissions: string[];
}

/**
 * Extends the Express Request type to hold the decoded JWT claims at the gateway layer.
 *
 * ─── WHY EXTEND REQUEST HERE AND NOT USE shared-middleware? ─────────────────
 * shared-middleware's createAuthenticateMiddleware() is designed for DOWNSTREAM services
 * that verify tokens and use req.user for business logic.
 *
 * The gateway's job is different:
 *   1. Verify the token (same as downstream)
 *   2. Extract claims to inject trusted headers (unique to the gateway)
 *   3. Check the Redis blocklist (gateway responsibility)
 *
 * We reuse the same req.user type from shared-middleware (via the global Express namespace)
 * and extend it with `jti` and `exp` which the blocklist middleware needs.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * The raw JWT `jti` claim — needed by the blocklist middleware (pipeline stage 4)
       * to check Redis for revoked tokens. Not present on unauthenticated routes.
       */
      jti?: string;
      /**
       * The JWT `exp` (expiry) epoch timestamp — passed to the blocklist middleware
       * for calculating TTL when writing to the blocklist on logout.
       */
      jwtExp?: number;
    }
  }
}

/**
 * PUBLIC_PATH_PREFIXES — routes that bypass JWT verification entirely.
 *
 * ─── WHY BYPASS AUTH FOR /api/v1/auth/* ? ────────────────────────────────────
 * These routes ARE the authentication endpoints — you can't require a JWT to log in
 * or register (you don't have a token yet). These endpoints handle credential
 * verification internally (password check, email verification tokens, etc.).
 *
 * The auth service itself enforces its own rate limiting (brute force protection)
 * and input validation. The gateway adds the global IP rate limiter on top.
 *
 * Any route NOT listed here is treated as authenticated and goes through the
 * full pipeline: JWT verify → blocklist check → header injection → proxy.
 */
const PUBLIC_PATH_PREFIXES = ['/api/v1/auth/'] as const;

/**
 * Checks if a request path matches any public (unauthenticated) route prefix.
 */
function isPublicPath(path: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Creates the JWT Verification Middleware (Pipeline Stage 3).
 *
 * ─── WHAT THIS MIDDLEWARE DOES ────────────────────────────────────────────────
 * 1. Skips entirely for public auth routes (login, register, etc.)
 * 2. Extracts the Bearer token from the Authorization header
 * 3. Verifies the RS256 signature using the auth service's PUBLIC KEY
 * 4. Validates expiry and standard claims (jose handles this automatically)
 * 5. Validates custom claims (role, email, permissions) are present
 * 6. Populates req.user, req.jti, req.jwtExp for downstream middleware
 *
 * ─── NOTE: BLOCKLIST CHECK IS A SEPARATE MIDDLEWARE ─────────────────────────
 * This middleware only verifies the cryptographic signature and claims.
 * The Redis blocklist check (whether this specific token has been explicitly
 * revoked via logout) happens in blocklist.middleware.ts (pipeline stage 4).
 * Separation of concerns: signature validation ≠ revocation status.
 *
 * @param jwtPublicKeyPem - The RSA public key PEM string from config.JWT_PUBLIC_KEY
 */
export function createJwtVerifyMiddleware(jwtPublicKeyPem: string): RequestHandler {
  /**
   * Pre-import the RSA public key ONCE at middleware creation time.
   * importSPKI() is a WebCrypto operation — doing it per-request would add
   * ~1-3ms of unnecessary overhead on every authenticated request.
   */
  const cleanPublicKeyPem = jwtPublicKeyPem.replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  const publicKeyPromise: Promise<KeyLike> = importSPKI(cleanPublicKeyPem, 'RS256');

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // ─── Step 1: Skip verification for public routes ──────────────────────
    // Public paths bypass the entire JWT pipeline (stages 3, 4, and header injection).
    // The proxy routes handle forwarding them directly to the auth service.
    if (isPublicPath(req.path)) {
      return next();
    }

    // ─── Step 2: Extract Bearer token ─────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(
        new UnauthorizedError(
          'Missing or malformed Authorization header. Authenticated endpoints require: Bearer <token>',
        ),
      );
    }

    const token = authHeader.slice(7); // Strip "Bearer " prefix (7 chars)

    try {
      const publicKey = await publicKeyPromise;

      // ─── Step 3: Cryptographic RS256 verification ──────────────────────
      // jose.jwtVerify() automatically validates:
      //   • RS256 signature — rejects tokens signed with any other algorithm
      //   • exp claim — rejects expired tokens (no manual Date.now() check needed)
      //   • nbf claim — rejects not-yet-valid tokens if present
      //   • algorithm whitelist — prevents algorithm confusion attacks (HS256, 'none')
      const { payload } = await jwtVerify<GatewayJWTPayload>(token, publicKey, {
        algorithms: ['RS256'],
      });

      // ─── Step 4: Validate required custom claims ───────────────────────
      // jose verifies standard claims (sub, exp, iat) automatically.
      // Our custom claims (role, email, permissions) must be checked manually.
      if (
        !payload.sub ||
        !payload.email ||
        !payload.role ||
        !payload.sessionId ||
        !Array.isArray(payload.permissions)
      ) {
        return next(
          new UnauthorizedError(
            'Token is missing required claims. This token may have been issued by an incompatible auth service version.',
          ),
        );
      }

      // ─── Step 5: Attach decoded claims to request context ─────────────
      // req.user is consumed by headerInjection.middleware.ts (stage 5)
      // req.jti is consumed by blocklist.middleware.ts (stage 4)
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        permissions: payload.permissions,
      };

      // JTI and exp are passed forward for the blocklist check.
      // jti uniquely identifies THIS token issuance — it's what gets blocklisted on logout.
      req.jti = payload.jti;
      req.jwtExp = payload.exp;

      next();
    } catch (error: unknown) {
      // Map jose errors to safe, client-facing error messages.
      // NEVER forward raw jose error messages — they may leak algorithm details.
      if (error instanceof Error) {
        if (error.name === 'JWTExpired') {
          return next(
            new UnauthorizedError(
              'Access token has expired. Please use your refresh token to obtain a new one.',
            ),
          );
        }
        if (
          error.name === 'JWSSignatureVerificationFailed' ||
          error.name === 'JWTInvalid' ||
          error.name === 'JWSInvalid'
        ) {
          return next(
            new UnauthorizedError(
              'Token signature verification failed. The token may have been tampered with.',
            ),
          );
        }
      }
      return next(new UnauthorizedError('Token verification failed.'));
    }
  };
}
