import { loadEnvironment } from '@fintech/shared-config';
import { z } from 'zod';

/**
 * Validated, merged configuration object for the Ledger Service.
 * Strict Zod validation guarantees the process crashes early on missing configs.
 */
export const config = loadEnvironment({
  /** PostgreSQL database URL for application runtime operations */
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid PostgreSQL connection string' }),

  /** Optional PostgreSQL database URL for migrations */
  MIGRATION_DATABASE_URL: z
    .string()
    .url({ message: 'MIGRATION_DATABASE_URL must be a valid PostgreSQL connection string' })
    .optional(),

  /** Redis connection URL */
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis connection string' }),

  /** RabbitMQ messaging connection string */
  RABBITMQ_URL: z.string().url({ message: 'RABBITMQ_URL must be a valid AMQP connection string' }),

  /**
   * Internal Service-to-Service API Key.
   */
  INTERNAL_API_KEY: z.string().min(1, { message: 'INTERNAL_API_KEY must be configured' }),

  /**
   * Downstream Account Service URL.
   */
  ACCOUNT_SERVICE_URL: z.string().url({ message: 'ACCOUNT_SERVICE_URL must be a valid URL' }),
});
