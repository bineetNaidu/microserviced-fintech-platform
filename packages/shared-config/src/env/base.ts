import { z } from 'zod';

/**
 * Base Environment Variable Validation Schema.
 * Enforces primitive configuration properties required by every microservice container instance.
 */
export const baseEnvSchema = z.object({
  /** Runtime environment execution state context */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Dynamic container binding port, automatically converted from raw string to operational integer */
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('3000'),

  /** Telemetry output severity filtering threshold for standard Pino/Winston logging wrappers */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/** Static TypeScript type definition extracted directly from the baseline validation runtime rule block */
export type BaseEnv = z.infer<typeof baseEnvSchema>;
