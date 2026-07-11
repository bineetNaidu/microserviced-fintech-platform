import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import {
  traceMiddleware,
  requestLoggerMiddleware,
  errorMiddleware,
} from '@fintech/shared-middleware';
import { createAuthRouter } from './routes/v1/auth.routes';
import { createHealthRouter } from './routes/v1/health.routes';
import type { AuthController } from './controllers/auth.controller';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

/** Simple inline cookie parser middleware to avoid dependency overhead */
function cookieParserMiddleware(req: Request, _res: Response, next: NextFunction) {
  const cookieHeader = req.headers.cookie;
  req.cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie: string) => {
      const parts = cookie.split('=');
      req.cookies[parts[0].trim()] = decodeURIComponent(parts[1] || '').trim();
    });
  }
  next();
}

export function createApp(controller: AuthController, pool: Pool, redis: Redis): Express {
  const app = express();

  // ─── MIDDLEWARES ───────────────────────────────────────────────────────────

  app.use(express.json());
  app.use(cookieParserMiddleware);
  app.use(traceMiddleware);
  app.use(requestLoggerMiddleware);

  // ─── ROUTING ───────────────────────────────────────────────────────────────

  // Mount API paths on root `/` (routes internally declare `/v1/...` matching ApiRoutes)
  app.use('/', createAuthRouter(controller));

  // Mount health check probes
  app.use('/health', createHealthRouter(pool, redis));

  // ─── ERROR HANDLING ────────────────────────────────────────────────────────
  // Enforced as the final gateway middleware in the chain
  app.use(errorMiddleware);

  return app;
}
