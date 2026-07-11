import { loadEnvironment } from '@fintech/shared-config';
import { z } from 'zod';

/**
 * Validated, merged configuration object for the Auth Service.
 *
 * Utilizes the `@fintech/shared-config` loadEnvironment helper to validate both
 * baseline microservice parameters (PORT, NODE_ENV, SERVICE_NAME) and service-specific ones.
 *
 * If any environment variable is missing or malformed on bootstrap, the engine throws
 * a formatted schema breakdown and calls process.exit(1) to avoid unstable container boot states.
 */
export const config = loadEnvironment({
  /** PostgreSQL database URL */
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid PostgreSQL connection string' }),

  /** Redis connection URL (used for the JWT blocklist and brute-force lockout counters) */
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis connection string' }),

  /** RabbitMQ messaging connection string */
  RABBITMQ_URL: z.string().url({ message: 'RABBITMQ_URL must be a valid AMQP connection string' }),

  /**
   * RSA-2048 Private Key PEM string used to SIGN JWT access tokens (RS256 algorithm).
   *
   * ─── WHY RSA PRIVATE KEY HERE? (ADR-005) ─────────────────────────────────────
   * The Auth Service is the ONLY service that holds the private key.
   * It can sign tokens — no other service can.
   *
   * The corresponding PUBLIC KEY is distributed to every other service (API Gateway,
   * User Service, etc.) so they can VERIFY tokens without ever being able to forge one.
   * This way, even if a downstream service is compromised, the attacker only gets the
   * public key — they cannot issue new tokens.
   *
   * ─── HOW TO GENERATE IN LOCAL DEV ─────────────────────────────────────────────
   * openssl genrsa -out private.pem 2048
   * openssl rsa -in private.pem -pubout -out public.pem
   *
   * Store the contents of private.pem as JWT_PRIVATE_KEY (with literal \n newlines
   * in a .env file, or as a multi-line secret in Kubernetes Secrets).
   *
   * NEVER commit private.pem to Git. It goes in `.env` (gitignored) or a K8s Secret.
   */
  JWT_PRIVATE_KEY: z
    .string()
    .min(100, { message: 'JWT_PRIVATE_KEY must be a valid RSA private key PEM string' }),

  /**
   * RSA-2048 Public Key PEM string used to VERIFY JWT access tokens internally.
   *
   * The auth service uses this key for its own internal blocklist verification pass
   * during refresh token rotation (to read the token claims before blocklisting the JTI).
   * All other services — particularly the API Gateway — also hold this same public key.
   *
   * This value is safe to distribute widely. It cannot be used to sign tokens.
   */
  JWT_PUBLIC_KEY: z
    .string()
    .min(100, { message: 'JWT_PUBLIC_KEY must be a valid RSA public key PEM string' }),
});
