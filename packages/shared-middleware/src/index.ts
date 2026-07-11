/**
 * @fintech/shared-middleware
 * Centralized Express middleware collection for all microservices.
 *
 * RECOMMENDED MIDDLEWARE ORDER (register in this sequence in your app.ts):
 *
 *  1. requestLoggerMiddleware    — Log every request FIRST (captures full duration)
 *  2. traceMiddleware            — Attach correlationId from headers (needed by logger)
 *  3. createRateLimiter(...)     — Reject throttled requests early (before auth overhead)
 *  4. createAuthenticateMiddleware(...) — Verify JWT, populate req.user
 *  5. requireRole([...])         — Gate routes by role (reads req.user)
 *  6. validateBody(schema)       — Validate request body with Zod
 *  7. [route handlers]           — Business logic
 *  8. errorMiddleware            — MUST be last (catch-all for next(err) calls)
 */

export * from './trace.middleware';
export * from './error.middleware';
export * from './validation.middleware';
export * from './auth.middleware';
export * from './authenticate.middleware';
export * from './rateLimiter.middleware';
export * from './requestLogger.middleware';
