import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request } from 'express';
import { config } from '../config';
import { ApiRoutes } from '@fintech/shared-config';

/**
 * API Gateway Proxy Routes.
 *
 * ─── HOW REVERSE PROXYING WORKS ─────────────────────────────────────────────
 * `http-proxy-middleware` intercepts the request AFTER all our middleware runs
 * (JWT verify → blocklist check → header injection) and forwards it to the
 * upstream service. The upstream service sees the request as if it came directly
 * from the gateway — with all the X-User-* headers already injected.
 *
 * Request flow example:
 *   Client → POST /api/v1/accounts/
 *     1. traceMiddleware()           — injects X-Correlation-Id
 *     2. rateLimiterMiddleware()     — checks IP rate limit in Redis
 *     3. jwtVerifyMiddleware()       — verifies RS256 JWT signature
 *     4. blocklistMiddleware()       — checks JTI in Redis blocklist
 *     5. headerInjectionMiddleware() — injects X-User-* headers
 *     6. createProxyMiddleware()     — forwards to http://account-service:3003/api/v1/accounts/
 *
 * ─── PATH REWRITING ─────────────────────────────────────────────────────────
 * We do NOT rewrite paths — the upstream service receives the SAME path the client sent.
 * Example: /api/v1/auth/login → forwards to AUTH_SERVICE_URL/api/v1/auth/login
 *
 * This convention keeps upstream service routes self-contained and avoids magic path transforms
 * that are easy to get wrong and hard to debug.
 *
 * ─── changeOrigin: true ─────────────────────────────────────────────────────
 * Sets the Host header of the proxied request to match the target origin.
 * Without this, the upstream service would see `Host: api-gateway:8080` instead of
 * `Host: auth-service:3001`, which can cause routing issues in services that inspect Host.
 *
 * ─── ERROR HANDLING ──────────────────────────────────────────────────────────
 * Each proxy has an `on.error` handler that catches network-level errors
 * (e.g., upstream service is down, connection refused). These are logged to stderr
 * for structured log aggregation and returned as 503 Service Unavailable to the client.
 */
export function createProxyRoutes(): Router {
  const router = Router();

  // ─── Auth Service Routes ─────────────────────────────────────────────────
  // PUBLIC: /api/v1/auth/* — does NOT require JWT (login, register, verify, etc.)
  // The jwtVerify middleware skips these paths based on PUBLIC_PATH_PREFIXES.
  router.use(
    ApiRoutes.ApiPrefixes.Auth,
    createProxyMiddleware({
      target: config.AUTH_SERVICE_URL,
      changeOrigin: true,
      on: {
        error: (err: Error, req: Request, res) => {
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              msg: 'GATEWAY_PROXY_ERROR',
              upstream: 'auth-service',
              target: config.AUTH_SERVICE_URL,
              path: req.path,
              error: err.message,
              correlationId: req.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          if ('status' in res && typeof res.status === 'function') {
            (res as import('express').Response).status(503).json({
              success: false,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Auth service is temporarily unavailable. Please try again.',
              },
            });
          }
        },
      },
    }),
  );

  // ─── User Service Routes ─────────────────────────────────────────────────
  // AUTHENTICATED: /api/v1/users/* — requires a valid JWT
  router.use(
    ApiRoutes.ApiPrefixes.Users,
    createProxyMiddleware({
      target: config.USER_SERVICE_URL,
      changeOrigin: true,
      on: {
        error: (err: Error, req: Request, res) => {
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              msg: 'GATEWAY_PROXY_ERROR',
              upstream: 'user-service',
              target: config.USER_SERVICE_URL,
              path: req.path,
              error: err.message,
              correlationId: req.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          if ('status' in res && typeof res.status === 'function') {
            (res as import('express').Response).status(503).json({
              success: false,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'User service is temporarily unavailable. Please try again.',
              },
            });
          }
        },
      },
    }),
  );

  // ─── Account Service Routes ──────────────────────────────────────────────
  // AUTHENTICATED: /api/v1/accounts/* — requires a valid JWT
  router.use(
    ApiRoutes.ApiPrefixes.Accounts,
    createProxyMiddleware({
      target: config.ACCOUNT_SERVICE_URL,
      changeOrigin: true,
      on: {
        error: (err: Error, req: Request, res) => {
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              msg: 'GATEWAY_PROXY_ERROR',
              upstream: 'account-service',
              target: config.ACCOUNT_SERVICE_URL,
              path: req.path,
              error: err.message,
              correlationId: req.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          if ('status' in res && typeof res.status === 'function') {
            (res as import('express').Response).status(503).json({
              success: false,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Account service is temporarily unavailable. Please try again.',
              },
            });
          }
        },
      },
    }),
  );

  // ─── Transfer Service Routes ─────────────────────────────────────────────
  // AUTHENTICATED: /api/v1/transfers/* — requires a valid JWT
  router.use(
    ApiRoutes.ApiPrefixes.Transfers,
    createProxyMiddleware({
      target: config.TRANSFER_SERVICE_URL,
      changeOrigin: true,
      on: {
        error: (err: Error, req: Request, res) => {
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              msg: 'GATEWAY_PROXY_ERROR',
              upstream: 'transfer-service',
              target: config.TRANSFER_SERVICE_URL,
              path: req.path,
              error: err.message,
              correlationId: req.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          if ('status' in res && typeof res.status === 'function') {
            (res as import('express').Response).status(503).json({
              success: false,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Transfer service is temporarily unavailable. Please try again.',
              },
            });
          }
        },
      },
    }),
  );

  return router;
}
