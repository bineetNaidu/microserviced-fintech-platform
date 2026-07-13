import { loadEnvironment } from '@fintech/shared-config';
import { z } from 'zod';

/**
 * Validated, merged configuration object for the User Service.
 *
 * Utilizes the `@fintech/shared-config` loadEnvironment helper to validate both
 * baseline microservice parameters (PORT, NODE_ENV, SERVICE_NAME) and service-specific ones.
 */
export const config = loadEnvironment({
  /** PostgreSQL database URL */
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid PostgreSQL connection string' }),

  /** Redis connection URL (used for temporary suspension caches) */
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis connection string' }),

  /** RabbitMQ messaging connection string */
  RABBITMQ_URL: z.string().url({ message: 'RABBITMQ_URL must be a valid AMQP connection string' }),

  /**
   * RSA-2048 Public Key PEM string used to VERIFY JWT access tokens (RS256 algorithm).
   * Verifies the authenticity of tokens injected downstream by the API Gateway.
   */
  JWT_PUBLIC_KEY: z
    .string()
    .min(100, { message: 'JWT_PUBLIC_KEY must be a valid RSA public key PEM string' }),

  /**
   * Internal Service-to-Service API Key.
   * Required for authenticating requests sent from other microservices (e.g. transfer-service).
   */
  INTERNAL_API_KEY: z.string().min(1, { message: 'INTERNAL_API_KEY must be configured' }),
});
