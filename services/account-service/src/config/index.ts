import { loadEnvironment } from '@fintech/shared-config';
import { z } from 'zod';

/**
 * Validated, merged configuration object for the Account Service.
 */
export const config = loadEnvironment({
  /** PostgreSQL database URL */
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid PostgreSQL connection string' }),

  /** Redis connection URL */
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis connection string' }),

  /** RabbitMQ messaging connection string */
  RABBITMQ_URL: z.string().url({ message: 'RABBITMQ_URL must be a valid AMQP connection string' }),

  /**
   * RSA-2048 Public Key PEM string used to verify JWT access tokens (RS256 algorithm).
   */
  JWT_PUBLIC_KEY: z
    .string()
    .min(100, { message: 'JWT_PUBLIC_KEY must be a valid RSA public key PEM string' }),

  /**
   * Internal Service-to-Service API Key.
   */
  INTERNAL_API_KEY: z.string().min(1, { message: 'INTERNAL_API_KEY must be configured' }),

  /**
   * Downstream User Service URL for checking KYC/Profile statuses.
   */
  USER_SERVICE_URL: z.string().url({ message: 'USER_SERVICE_URL must be a valid URL' }),
});
