import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

/**
 * Creates the Express router for liveness and readiness checks.
 */
export function createHealthRouter(pool: Pool, redis: Redis): Router {
  const router = Router();

  /** Liveness probe — returns 200 immediately to signal container is active */
  router.get('/live', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  /** Readiness probe — queries PG and Redis to confirm database readiness */
  router.get('/ready', async (_req, res) => {
    const checks: Record<string, 'up' | 'down'> = {
      database: 'down',
      redis: 'down',
    };

    let isHealthy = true;

    // Database check
    try {
      await pool.query('SELECT 1');
      checks.database = 'up';
    } catch {
      isHealthy = false;
    }

    // Redis check
    try {
      const ping = await redis.ping();
      if (ping === 'PONG') {
        checks.redis = 'up';
      } else {
        isHealthy = false;
      }
    } catch {
      isHealthy = false;
    }

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json({
      status: isHealthy ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: checks,
    });
  });

  return router;
}
