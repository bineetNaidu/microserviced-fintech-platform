import express from 'express';
import type { Express } from 'express';
import {
  traceMiddleware,
  requestLoggerMiddleware,
  errorMiddleware,
} from '@fintech/shared-middleware';
import { createUserRouter } from './routes/v1/user.routes';
import { createHealthRouter } from './routes/v1/health.routes';
import type { UserController } from './controllers/user.controller';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

/**
 * Creates and configures the Express application for User Service.
 */
export function createApp(controller: UserController, pool: Pool, redis: Redis): Express {
  const app = express();

  // ─── MIDDLEWARES ───────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(traceMiddleware);
  app.use(requestLoggerMiddleware);

  // ─── ROUTING ───────────────────────────────────────────────────────────────
  // Mount API paths on root `/` (routes internally declare `/v1/...`)
  app.use('/', createUserRouter(controller));

  // Mount health check probes
  app.use('/health', createHealthRouter(pool, redis));

  // ─── ERROR HANDLING ────────────────────────────────────────────────────────
  app.use(errorMiddleware);

  return app;
}
