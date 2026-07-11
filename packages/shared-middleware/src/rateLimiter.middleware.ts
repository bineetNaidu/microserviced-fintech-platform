import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { RateLimitError } from '@fintech/shared-errors';

/**
 * Configuration options for the rate limiter middleware factory.
 */
export interface RateLimiterOptions {
  /** Initialized ioredis client — the service is responsible for its lifecycle (connect/close) */
  redis: Redis;

  /**
   * Time window duration in milliseconds.
   * All requests within this window are counted against the limit per key.
   * @default 60_000 (1 minute)
   */
  windowMs?: number;

  /**
   * Maximum number of requests allowed per window per rate limit key.
   * @default 100
   */
  maxRequests?: number;

  /**
   * Redis key prefix to namespace rate limit counters by route group.
   * Use different prefixes for different route groups to set independent limits:
   *   'auth'      → login/register routes (aggressive limits, brute-force protection)
   *   'transfers' → transfer initiation routes (strict limits, fraud loop protection)
   *   'api'       → general authenticated API routes (generous limits)
   * @default 'rl'
   */
  keyPrefix?: string;

  /**
   * Key extraction strategy — determines WHAT entity the limit applies to:
   *
   * 'ip'   → Rate limit by client IP address.
   *          Best for: Public routes (login, register, forgot-password)
   *          Defends against: Credential stuffing, brute-force, enumeration
   *
   * 'user' → Rate limit by authenticated user ID (req.user.id).
   *          Best for: Authenticated routes (transfers, account mutations)
   *          Defends against: API abuse by legitimate but malicious accounts
   *          NOTE: Requires authenticate middleware to run first.
   *
   * 'both' → Apply both IP and user limits independently.
   *          A request is only allowed if BOTH limits pass.
   *          Best for: High-value operations (large transfers, KYC submission)
   *          Defends against: Both categories of abuse simultaneously
   *
   * @default 'ip'
   */
  strategy?: 'ip' | 'user' | 'both';

  /**
   * Optional predicate to skip rate limiting for specific requests.
   * Return true to bypass the rate limiter for that request.
   *
   * @example
   * // Skip rate limiting for internal health check routes
   * skip: (req) => req.path === '/health' || req.path === '/ready'
   */
  skip?: (req: Request) => boolean;
}

/**
 * Lua script for atomic fixed-window rate limiting in Redis.
 *
 * ─── WHY LUA? ────────────────────────────────────────────────────────────────
 * Redis is single-threaded, but we need two operations to be atomic together:
 *   1. INCR key     — increment the request counter
 *   2. EXPIRE key N — set the TTL on the key (only if it's new)
 *
 * If done separately (two round trips), a race condition exists:
 *   Thread A: INCR key → count = 1
 *   Thread B: INCR key → count = 2
 *   Thread B: EXPIRE key 60  ← only B sets expiry, A never does
 *   Thread A: (never runs EXPIRE because it already ran INCR)
 *   → Key may never expire → clients permanently rate-limited
 *
 * Redis executes Lua scripts atomically — no other command runs between script steps.
 * This eliminates the race condition entirely.
 *
 * ─── SCRIPT LOGIC ────────────────────────────────────────────────────────────
 * KEYS[1] = the rate limit key (e.g., 'rl:ip:203.0.113.1')
 * ARGV[1] = window duration in seconds
 *   1. Increment the key counter (INCR creates the key if it doesn't exist)
 *   2. If this is the FIRST increment (count == 1), set the TTL for the window
 *   3. Return the current count so the middleware can check against maxRequests
 */
const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/**
 * Factory that creates a Redis-backed fixed-window rate limiter middleware.
 *
 * ─── FAIL-OPEN POLICY ────────────────────────────────────────────────────────
 * If Redis becomes unavailable (network partition, Redis crash), this middleware
 * FAILS OPEN — it allows all requests through rather than blocking them.
 *
 * Rationale: In a fintech platform, a Redis outage causing a full API outage
 * is worse than temporarily disabling rate limiting. Rate limiting is a defense
 * mechanism, not a core business function. Monitor Redis availability separately
 * via health checks and alerts — don't let it take down the payment API.
 *
 * ─── RETRY-AFTER HEADER ──────────────────────────────────────────────────────
 * When a limit is exceeded, the `Retry-After` header is set with the remaining
 * window duration in seconds. Well-behaved HTTP clients (including the frontend)
 * use this to implement automatic backoff rather than hammer-retrying.
 *
 * @example
 * // Aggressive login rate limiter (10 req/min per IP — brute force protection)
 * const loginLimiter = createRateLimiter({
 *   redis,
 *   maxRequests: 10,
 *   windowMs: 60_000,
 *   strategy: 'ip',
 *   keyPrefix: 'auth',
 *   skip: (req) => req.path === '/health',
 * });
 *
 * @example
 * // Transfer rate limiter (both IP + user limits — double protection)
 * const transferLimiter = createRateLimiter({
 *   redis,
 *   maxRequests: 20,
 *   windowMs: 60_000,
 *   strategy: 'both',
 *   keyPrefix: 'transfers',
 * });
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const {
    redis,
    windowMs = 60_000,
    maxRequests = 100,
    keyPrefix = 'rl',
    strategy = 'ip',
    skip,
  } = options;

  // Convert window from milliseconds to seconds for Redis EXPIRE command
  const windowSeconds = Math.ceil(windowMs / 1_000);

  /**
   * Runs the Lua script to atomically increment and check the rate limit key.
   * Returns true if the limit has been exceeded, false if the request should proceed.
   */
  async function isLimitExceeded(key: string): Promise<boolean> {
    // eval() returns `unknown` from ioredis — we cast to number since the Lua
    // script always returns an integer (the current count after INCR).
    const count = (await redis.eval(
      RATE_LIMIT_LUA_SCRIPT,
      1, // numkeys — number of KEYS arguments
      key, // KEYS[1]
      windowSeconds.toString(), // ARGV[1] — TTL in seconds
    )) as number;

    return count > maxRequests;
  }

  /**
   * Extracts the client's real IP address.
   *
   * Checks X-Forwarded-For first, which is set by load balancers and reverse proxies
   * (Nginx, AWS ALB, Cloudflare) to preserve the original client IP.
   *
   * SECURITY WARNING: Only trust X-Forwarded-For if you are DEFINITELY behind a
   * trusted reverse proxy. If your Node.js server is directly internet-facing,
   * an attacker can set a fake X-Forwarded-For header to bypass IP rate limiting.
   * In that case, use req.socket.remoteAddress exclusively.
   *
   * X-Forwarded-For format: "client, proxy1, proxy2" — the first entry is the original client.
   */
  function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ipList = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ipList.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Bypass rate limiting for explicitly excluded routes (e.g., /health, /ready)
    if (skip?.(req)) {
      return next();
    }

    try {
      // ─── IP-based limit (applies to 'ip' and 'both' strategies) ───────────
      if (strategy === 'ip' || strategy === 'both') {
        const ip = getClientIp(req);
        const ipKey = `${keyPrefix}:ip:${ip}`;

        if (await isLimitExceeded(ipKey)) {
          // Retry-After header tells the client exactly when to retry (RFC 7231 §7.1.3)
          res.setHeader('Retry-After', windowSeconds.toString());
          return next(new RateLimitError(windowSeconds));
        }
      }

      // ─── User-based limit (applies to 'user' and 'both' strategies) ───────
      if (strategy === 'user' || strategy === 'both') {
        if (req.user?.id) {
          // User ID as part of the key prevents one user from sharing another's limit quota
          const userKey = `${keyPrefix}:user:${req.user.id}`;

          if (await isLimitExceeded(userKey)) {
            res.setHeader('Retry-After', windowSeconds.toString());
            return next(new RateLimitError(windowSeconds));
          }
        }
        // If strategy is 'user' but req.user is not set, skip silently.
        // The authenticate middleware should have already rejected the request
        // before this middleware runs on authenticated routes.
      }

      next();
    } catch (redisError: unknown) {
      // ─── FAIL-OPEN: Redis unavailable → allow request ─────────────────────
      // See "FAIL-OPEN POLICY" in the factory JSDoc for the full rationale.
      const errorLog = JSON.stringify({
        level: 'error',
        msg: 'RATE_LIMITER_REDIS_ERROR',
        note: 'Failing open — request allowed. Monitor Redis availability.',
        error:
          redisError instanceof Error
            ? { message: redisError.message }
            : { message: String(redisError) },
        timestamp: new Date().toISOString(),
      });
      process.stderr.write(errorLog + '\n');

      next(); // Allow the request through
    }
  };
}
