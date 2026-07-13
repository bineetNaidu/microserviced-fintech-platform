import express from 'express';
import type { Express } from 'express';
import {
  traceMiddleware,
  requestLoggerMiddleware,
  errorMiddleware,
} from '@fintech/shared-middleware';
import { createLedgerRouter } from './routes/v1/ledger.routes';
import { createHealthRouter } from './routes/v1/health.routes';
import type { LedgerController } from './controllers/ledger.controller';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

/**
 * Creates and configures the Express application for Ledger Service.
 */
export function createApp(controller: LedgerController, pool: Pool, redis: Redis): Express {
  const app = express();

  // ─── MIDDLEWARES ───────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(traceMiddleware);
  app.use(requestLoggerMiddleware);

  // ─── ROUTING ───────────────────────────────────────────────────────────────
  app.use('/', createLedgerRouter(controller));

  // Mount health check probes
  app.use('/health', createHealthRouter(pool, redis));

  // ─── ERROR HANDLING ────────────────────────────────────────────────────────
  app.use(errorMiddleware);

  return app;
}
