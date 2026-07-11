import { Pool, type PoolConfig } from 'pg';

/**
 * Production-safe PostgreSQL connection pool factory.
 *
 * ─── HOW CONNECTION POOLING WORKS ────────────────────────────────────────────
 * Opening a raw PostgreSQL connection costs ~50ms (TCP handshake + TLS + auth exchange).
 * A connection pool pre-creates N connections at startup and REUSES them across requests.
 * When a request needs the DB, it "checks out" a connection, runs the query, and returns
 * the connection to the pool. Under load, the pool queues callers if all connections are busy.
 *
 * ─── DRIZZLE ORM INTEGRATION ─────────────────────────────────────────────────
 * This package returns a raw `pg.Pool` — not a Drizzle instance — because each service
 * has its own Drizzle schema and the schema cannot be centralized here without creating
 * unacceptable coupling. Services use the pool directly with Drizzle:
 *
 * ```typescript
 * // In your service (e.g., transfer-service/src/db/index.ts)
 * import { createPool, drainPool } from '@fintech/shared-db';
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import * as schema from './schema';  // Your service's own Drizzle schema
 *
 * const pool = createPool(config.DATABASE_URL, {
 *   application_name: config.SERVICE_NAME,
 * });
 *
 * export const db = drizzle(pool, { schema });
 *
 * // SIGTERM handler — drain before process exit
 * process.on('SIGTERM', async () => {
 *   await drainPool(pool);
 *   process.exit(0);
 * });
 * ```
 *
 * ─── CONFIGURATION RATIONALE ─────────────────────────────────────────────────
 * max: 10
 *   Industry rule of thumb: (2 × num_vCPUs) + num_disk_spindles.
 *   For a single-vCPU container (typical K8s pod), 10 is generous.
 *   WARNING: Each service instance holds up to 10 connections. With 13 services × 3 replicas
 *   each, you reach 390 connections. PostgreSQL's default max_connections is 100.
 *   Set max_connections higher in Postgres or reduce this pool max per service accordingly.
 *   Monitor pg_stat_activity.count in production.
 *
 * idleTimeoutMillis: 30_000 (30s)
 *   Closes a connection that has been idle (no queries) for 30 seconds.
 *   Prevents connections from sitting open indefinitely, consuming Postgres resources.
 *
 * connectionTimeoutMillis: 5_000 (5s)
 *   Fails fast with an error if no connection is available within 5 seconds.
 *   Without this, a request might hang for 60+ seconds during a DB outage.
 *   Prefer a clear "database unavailable" error over an indefinite hang.
 *
 * application_name (via PoolConfig overrides)
 *   Appears in pg_stat_activity — lets DBAs identify which service is running which query.
 *   Essential for diagnosing slow query logs in production.
 *   Pass it as: createPool(url, { application_name: 'transfer-service' })
 *
 * @param connectionString - PostgreSQL connection URL (postgres://user:pass@host:5432/dbname)
 * @param overrides - Optional PoolConfig overrides for service-specific tuning
 * @returns A production-configured pg.Pool ready for use with Drizzle ORM
 */
export function createPool(connectionString: string, overrides?: Partial<PoolConfig>): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...overrides,
  });

  /**
   * CRITICAL: Attach a global 'error' event handler to the pool.
   *
   * Without this, an idle client that encounters a network reset or unexpected
   * disconnect emits an 'error' event on the Pool. If no listener is attached,
   * Node.js treats it as an unhandled error and CRASHES THE ENTIRE PROCESS.
   *
   * The pool automatically removes the broken client and creates a replacement,
   * so we do NOT need to call process.exit() — the pool self-heals.
   * We just log the event so operations teams know a connection was lost.
   */
  pool.on('error', (err: Error) => {
    const errorLog = JSON.stringify({
      level: 'error',
      msg: 'POSTGRES_POOL_IDLE_CLIENT_ERROR',
      note: 'The pool will automatically replace this connection. No manual action needed.',
      error: { name: err.name, message: err.message, stack: err.stack },
      timestamp: new Date().toISOString(),
    });
    process.stderr.write(errorLog + '\n');
    // DO NOT call process.exit() here — pool self-recovers
  });

  return pool;
}

/**
 * Gracefully shuts down the connection pool by draining all in-flight queries.
 *
 * Call this during SIGTERM handling to allow active transactions to complete
 * before the process exits. Abrupt process.exit() without draining can leave
 * Postgres with orphaned transactions that require manual cleanup (ROLLBACK).
 *
 * After this resolves, the pool is permanently closed — do not attempt queries afterward.
 *
 * @example
 * process.on('SIGTERM', async () => {
 *   logger.info('SIGTERM received — draining DB pool...');
 *   await drainPool(pool);
 *   logger.info('Pool drained. Exiting.');
 *   process.exit(0);
 * });
 */
export async function drainPool(pool: Pool): Promise<void> {
  await pool.end();
}
