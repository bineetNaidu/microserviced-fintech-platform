import express, { type Application, type Request, type Response } from 'express';
import cors from 'cors';
import type { Redis } from 'ioredis';
import { traceMiddleware, createRateLimiter, errorMiddleware } from '@fintech/shared-middleware';
import { config } from './config';
import { createJwtVerifyMiddleware } from './middlewares/jwtVerify.middleware';
import { createBlocklistMiddleware } from './middlewares/blocklist.middleware';
import { headerInjectionMiddleware } from './middlewares/headerInjection.middleware';
import { createProxyRoutes } from './routes/proxy.routes';

/**
 * Creates and configures the Express application for the API Gateway.
 *
 * ─── GATEWAY MIDDLEWARE PIPELINE ─────────────────────────────────────────────
 * Every request flows through these stages in ORDER:
 *
 * Stage 1 — CORS        : Validates the Origin header, handles preflight (OPTIONS) requests.
 * Stage 2 — Trace       : Generates or extracts X-Correlation-Id for distributed tracing.
 * Stage 3 — Rate Limit  : Checks per-IP request rate in Redis. Rejects with 429 if exceeded.
 * Stage 4 — JWT Verify  : Verifies RS256 signature and claims. Skips public auth routes.
 * Stage 5 — Blocklist   : Checks Redis for revoked JTI or suspended userId. Fail-closed.
 * Stage 6 — Headers     : Strips Authorization header, injects X-User-* trusted headers.
 * Stage 7 — Proxy       : Forwards the prepared request to the appropriate upstream service.
 * Stage 8 — Error       : Catches all errors from stages 1-7, returns structured JSON.
 *
 * ─── WHY THIS ORDER MATTERS ──────────────────────────────────────────────────
 * CORS before trace: CORS preflight (OPTIONS) must return immediately — no point
 *   generating a trace ID for a preflight that won't reach the backend.
 *
 * Rate limit before JWT: Rate limiting by IP protects even the auth endpoints from
 *   brute-force attacks. If JWT verification ran first, an attacker could exhaust the
 *   server with invalid token verification attempts before hitting the rate limit.
 *
 * JWT before blocklist: No point checking Redis if the token signature is invalid —
 *   saves a Redis round-trip for malformed tokens.
 *
 * Blocklist before headers: No point injecting user headers if the token is revoked.
 *   The header injection step reads req.user which is populated by JWT verify.
 *
 * Error middleware LAST: Express requires the 4-argument error handler to be the
 *   LAST middleware registered. It catches all next(error) calls from all stages above.
 *
 * @param redis - The ioredis client for rate limiting and blocklist checks
 */
export function createApp(redis: Redis): Application {
  const app = express();

  // ─── Stage 0: Request Body Parsing ────────────────────────────────────────
  // The gateway does NOT parse request bodies — it forwards them as-is (pass-through).
  // Parsing the body would consume the readable stream, causing the proxy to forward
  // an empty body. http-proxy-middleware handles raw body forwarding natively.
  // EXCEPTION: We parse JSON only for the health check endpoint below.
  app.use('/healthz', express.json()); // Only for health check
  app.use('/readyz', express.json());

  // ─── Stage 1: CORS ────────────────────────────────────────────────────────
  // CORS validates that the browser's Origin header matches the allowed origins list.
  // This prevents cross-site request forgery from unauthorized origins.
  //
  // `credentials: true` is required when the client sends cookies or Authorization headers.
  // `allowedHeaders` explicitly lists what headers clients may send — unknown headers are blocked.
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no Origin (server-to-server, curl, Postman)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: Origin '${origin}' is not in the allowed list.`));
        }
      },
      credentials: true, // Required for Authorization: Bearer cookies + header flows
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
      exposedHeaders: ['X-Correlation-Id'], // Client can read this header in JS
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // ─── Stage 2: Distributed Trace Header ───────────────────────────────────
  // Extracts X-Correlation-Id from client or generates a new UUID.
  // Binds it to req.correlationId for use in logs and downstream headers.
  app.use(traceMiddleware);

  // ─── Stage 3: IP Rate Limiting ────────────────────────────────────────────
  // Uses the shared Redis-backed rate limiter from @fintech/shared-middleware.
  // Limits requests per IP address using an atomic Redis Lua script (prevents
  // race conditions under concurrent requests from the same IP).
  //
  // The rate limiter FAILS OPEN (lets requests through if Redis is unavailable)
  // to avoid availability outages for legitimate traffic. This is intentionally
  // the OPPOSITE of the blocklist middleware (which fails closed).
  app.use(
    createRateLimiter({
      redis, // ioredis client
      windowMs: 60_000, // 60-second rolling window
      maxRequests: 100, // 100 requests per IP per 60 seconds
      strategy: 'ip', // Key per client IP address
      keyPrefix: 'gw', // Namespace prefix: 'gw:ip:{ipAddress}'
    }),
  );

  // ─── Stage 4: JWT RS256 Verification ─────────────────────────────────────
  // Verifies the Bearer token's RS256 signature using the auth service's public key.
  // Populates req.user, req.jti, req.jwtExp on success.
  // Skips this stage for public auth routes (/api/v1/auth/*).
  app.use(createJwtVerifyMiddleware(config.JWT_PUBLIC_KEY));

  // ─── Stage 5: Redis Blocklist Check ──────────────────────────────────────
  // Checks if the verified token's JTI has been blocklisted (user logged out)
  // or if the user's account has been suspended. FAILS CLOSED (see blocklist.middleware.ts).
  app.use(createBlocklistMiddleware(redis));

  // ─── Stage 6: Trusted Header Injection ───────────────────────────────────
  // Strips the raw Authorization header.
  // Injects X-User-Id, X-User-Role, X-User-Email, X-User-Permissions headers.
  // Downstream services read these and trust them — no re-verification needed.
  app.use(headerInjectionMiddleware());

  // ─── Health & Readiness Probes ────────────────────────────────────────────
  // These are checked by Kubernetes liveness/readiness probes.
  // healthz: "Is the process running?" — always returns 200 if the server is up
  // readyz:  "Is the service ready to serve traffic?" — checks Redis connectivity
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', service: config.SERVICE_NAME });
  });

  app.get('/readyz', async (_req: Request, res: Response) => {
    // Check Redis connectivity — if Redis is down, the gateway can't check blocklists
    try {
      await redis.ping();
      res.status(200).json({ status: 'ready', service: config.SERVICE_NAME, redis: 'connected' });
    } catch {
      res
        .status(503)
        .json({ status: 'not_ready', service: config.SERVICE_NAME, redis: 'disconnected' });
    }
  });

  // ─── Stage 7: Service Proxy Routes ───────────────────────────────────────
  // Routes requests to the appropriate upstream service based on the URL prefix.
  // By the time a request reaches here, it's fully authenticated, rate-limited,
  // and has trusted headers injected — the upstream service just does its work.
  app.use(createProxyRoutes());

  // ─── 404 Catch-All ───────────────────────────────────────────────────────
  // Any unmatched route returns a clean JSON 404 instead of Express's HTML "Cannot GET /" page.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist on this gateway.',
      },
    });
  });

  // ─── Stage 8: Global Error Handler ───────────────────────────────────────
  // Catches all errors thrown or passed via next(error) from stages 1-7.
  // Returns structured JSON with error code, message, and traceId.
  // Must be the LAST middleware registered (4-param signature).
  app.use(errorMiddleware);

  return app;
}
