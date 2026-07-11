import { loadEnvironment } from '@fintech/shared-config';
import { z } from 'zod';

/**
 * Validated configuration for the API Gateway service.
 *
 * Uses `loadEnvironment` from `@fintech/shared-config` which:
 *   1. Merges these service-specific fields with the base schema (PORT, NODE_ENV, SERVICE_NAME, LOG_LEVEL)
 *   2. Validates everything against the merged Zod schema on boot
 *   3. Calls process.exit(1) if any field is missing or malformed — a misconfigured
 *      gateway is more dangerous than no gateway (it could pass unauthenticated requests)
 */
export const config = loadEnvironment({
  /**
   * RSA-2048 Public Key PEM string for verifying JWT access tokens (RS256).
   *
   * ─── GATEWAY IS VERIFY-ONLY (ADR-005) ────────────────────────────────────
   * The gateway holds ONLY the public key — never the private key.
   * This means the gateway can cryptographically VERIFY that a token was signed
   * by the auth service, but it CANNOT issue new tokens.
   *
   * If this gateway is ever compromised, the attacker gets the public key —
   * which is safe to expose (it's mathematically useless for forging tokens).
   *
   * HOW TO GET THIS VALUE:
   *   openssl rsa -in private.pem -pubout -out public.pem
   *   Then paste the contents of public.pem here (same key used in auth-service JWT_PUBLIC_KEY)
   */
  JWT_PUBLIC_KEY: z
    .string()
    .min(100, { message: 'JWT_PUBLIC_KEY must be a valid RSA public key PEM string' }),

  /**
   * Comma-separated list of CORS allowed origins.
   * Example: "http://localhost:3000,https://app.fintech.com"
   * The gateway will reject preflight requests from any origin not in this list.
   */
  ALLOWED_ORIGINS: z
    .string()
    .min(1, { message: 'ALLOWED_ORIGINS must contain at least one allowed origin' }),

  /**
   * Redis connection URL.
   * The gateway uses Redis for two purposes:
   *   1. JWT blocklist check on every authenticated request (ADR-007)
   *   2. Distributed rate limiting counters per IP/user (ADR-rate-limiting)
   */
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis connection string' }),

  // ─── Upstream Service URLs ─────────────────────────────────────────────────
  // These are the internal URLs the gateway proxies requests to.
  // In local dev: http://localhost:{port}
  // In Kubernetes: http://{service-name}:{port} (DNS resolved by kube-dns)
  //
  // The k8s Service name is the same as the service directory name, which is why
  // keeping consistent naming matters — `auth-service` in k8s/base/ maps to
  // the URL http://auth-service:3001 in the cluster network.

  /** Auth Service internal URL — used for /api/v1/auth/* proxy target */
  AUTH_SERVICE_URL: z.string().url({ message: 'AUTH_SERVICE_URL must be a valid URL' }),

  /** User Service internal URL — used for /api/v1/users/* proxy target */
  USER_SERVICE_URL: z
    .string()
    .url({ message: 'USER_SERVICE_URL must be a valid URL' })
    .default('http://localhost:3002'),

  /** Account Service internal URL — used for /api/v1/accounts/* proxy target */
  ACCOUNT_SERVICE_URL: z
    .string()
    .url({ message: 'ACCOUNT_SERVICE_URL must be a valid URL' })
    .default('http://localhost:3003'),

  /** Transfer Service internal URL — used for /api/v1/transfers/* proxy target */
  TRANSFER_SERVICE_URL: z
    .string()
    .url({ message: 'TRANSFER_SERVICE_URL must be a valid URL' })
    .default('http://localhost:3004'),
});
