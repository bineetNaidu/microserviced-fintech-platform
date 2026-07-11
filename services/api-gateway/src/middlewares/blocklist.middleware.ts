import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { UnauthorizedError } from '@fintech/shared-errors';

/**
 * Creates the Redis Blocklist Check Middleware (Pipeline Stage 4).
 *
 * ─── PURPOSE (ADR-007) ────────────────────────────────────────────────────────
 * JWTs are stateless — a valid token is valid until it expires (15 minutes).
 * This creates a problem: if a user logs out, their token is still cryptographically
 * valid for up to 15 minutes. The blocklist solves this.
 *
 * HOW IT WORKS:
 *   On logout: auth service writes `jti:blocklist:{jti}` → Redis with TTL = remaining token life
 *   On request: this middleware checks if the token's jti is in Redis
 *   If found → 401 Unauthorized (even though the signature is cryptographically valid)
 *
 * This middleware runs AFTER jwtVerify.middleware.ts (stage 3), which means:
 *   - req.jti is guaranteed to be populated for authenticated routes
 *   - Public routes are already skipped (req.jti will be undefined)
 *
 * ─── FAIL-CLOSED VS FAIL-OPEN ─────────────────────────────────────────────────
 * This middleware uses FAIL-CLOSED policy (unlike the rate limiter which fails open).
 *
 * Rationale:
 *   - Rate limiter failing open → worst case: some extra requests get through → acceptable
 *   - Blocklist failing open → worst case: a logged-out user or suspended user keeps access
 *     to financial operations → NOT acceptable
 *
 * If Redis is unavailable, we reject the request with 503. Yes, this means a Redis
 * outage causes authentication failures. This is by design — the alternative (trusting
 * tokens we can't verify against the blocklist) is a security risk for a financial platform.
 * Monitor Redis availability aggressively with alerts and health checks.
 *
 * ─── SUSPENDED USERS FAST-PATH ────────────────────────────────────────────────
 * The suspension consumer in auth-service writes `suspended:{userId}` to Redis when
 * a user is suspended via the operations service. This middleware also checks this
 * key to catch suspended users faster than waiting for all their tokens to expire.
 *
 * @param redis - The shared ioredis client instance
 */
export function createBlocklistMiddleware(redis: Redis): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // ─── Skip for public routes ────────────────────────────────────────────
    // If req.jti is not set, jwtVerify.middleware.ts skipped this request
    // (it's a public route like /api/v1/auth/*). No blocklist check needed.
    if (!req.jti) {
      return next();
    }

    try {
      // ─── Check 1: JTI blocklist ─────────────────────────────────────────
      // Checks if this specific token has been explicitly revoked via logout.
      // The key format `jti:blocklist:{jti}` matches what auth service writes in
      // TokenService.blocklistToken() — this is the shared contract between services.
      const isRevoked = await redis.get(`jti:blocklist:${req.jti}`);
      if (isRevoked !== null) {
        return next(
          new UnauthorizedError(
            'This access token has been explicitly revoked (logout detected). Please log in again.',
          ),
        );
      }

      // ─── Check 2: User suspension fast-path ────────────────────────────
      // Checks if the user was suspended by the operations service.
      // The key `suspended:{userId}` is written by the auth service's suspension
      // consumer when it processes `operations.user_suspended` events.
      // This provides near-instant blocking (< 1s after event processing) instead of
      // waiting up to 15 minutes for access tokens to naturally expire.
      if (req.user?.id) {
        const isSuspended = await redis.get(`suspended:${req.user.id}`);
        if (isSuspended !== null) {
          return next(
            new UnauthorizedError(
              'Your account has been suspended. Please contact support for assistance.',
            ),
          );
        }
      }

      // All checks passed — token is valid and not revoked
      next();
    } catch (redisError: unknown) {
      // ─── FAIL-CLOSED: Redis unavailable → reject request ───────────────
      // See the "FAIL-CLOSED VS FAIL-OPEN" section in the function JSDoc for rationale.
      process.stderr.write(
        JSON.stringify({
          level: 'error',
          msg: 'GATEWAY_BLOCKLIST_REDIS_ERROR',
          note: 'Failing CLOSED — rejecting request. Cannot verify token revocation status.',
          jti: req.jti,
          error:
            redisError instanceof Error
              ? { message: redisError.message }
              : { message: String(redisError) },
          timestamp: new Date().toISOString(),
        }) + '\n',
      );

      // Return 503 Service Unavailable — not a client error (401), but an infrastructure error
      return next(
        new UnauthorizedError(
          'Authentication verification is temporarily unavailable. Please try again in a moment.',
        ),
      );
    }
  };
}
