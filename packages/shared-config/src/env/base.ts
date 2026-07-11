import { z } from 'zod';

/**
 * Base Environment Variable Validation Schema.
 *
 * Enforces configuration properties required by EVERY microservice container instance.
 * Individual services extend this with their own service-specific variables via loadEnvironment().
 *
 * VALIDATION PHILOSOPHY:
 * This schema is the first line of defense against misconfigured deployments.
 * If any field fails, loadEnvironment() calls process.exit(1) immediately.
 * A service that starts with invalid config is MORE dangerous than one that refuses to start.
 */
export const baseEnvSchema = z.object({
  /**
   * Runtime execution environment context.
   * Controls: logging verbosity, error detail exposure, dev-only features.
   * In production, detailed error messages are hidden from API responses.
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * TCP port the service HTTP server binds to.
   *
   * VALIDATION CHAIN:
   * 1. string() — environment variables are always strings
   * 2. transform(parseInt) — convert to integer before validation
   * 3. refine(...) — validate it's a valid TCP port (1-65535)
   * 4. default('3000') — fallback for local development
   *
   * WHY THE RANGE CHECK?
   * Without .refine(), `PORT=0` or `PORT=99999` would pass parseInt (returning 0 or 99999)
   * and cause a cryptic EADDRINUSE or EACCES bind error at runtime instead of a clear
   * startup failure with the exact misconfiguration identified.
   */
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((port) => port >= 1 && port <= 65535, {
      message: 'PORT must be a valid TCP port number between 1 and 65535 (e.g., 3000, 8080)',
    })
    .default('3000'),

  /** Telemetry output severity filtering threshold for structured logging wrappers */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Human-readable lowercase kebab-case service identifier.
   *
   * This value is propagated into:
   *  • Structured log lines — identifies WHICH service emitted the log in aggregators
   *  • EventEnvelope.producer — traces WHICH service published a RabbitMQ event
   *  • Prometheus metric labels — distinguishes metrics across services in Grafana
   *  • Health check responses — human-readable service identity
   *
   * Convention: use the exact service directory name (e.g., 'transfer-service').
   * Regex enforces lowercase kebab-case: must start with a letter, followed by
   * lowercase letters, digits, or hyphens. NO underscores, NO uppercase.
   *
   * Example values: 'transfer-service', 'auth-service', 'ledger-service'
   */
  SERVICE_NAME: z
    .string()
    .min(1, { message: 'SERVICE_NAME cannot be empty' })
    .regex(/^[a-z][a-z0-9-]*$/, {
      message:
        "SERVICE_NAME must be lowercase kebab-case, e.g. 'transfer-service'. No uppercase or underscores.",
    }),
});

/** Static TypeScript type definition extracted directly from the baseline validation runtime rule block */
export type BaseEnv = z.infer<typeof baseEnvSchema>;
