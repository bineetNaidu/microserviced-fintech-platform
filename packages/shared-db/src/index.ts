/**
 * @fintech/shared-db
 * PostgreSQL Infrastructure Layer for all microservices.
 *
 * This package provides a production-safe pg.Pool factory that is compatible
 * with Drizzle ORM. It does NOT include Drizzle — services install and configure
 * Drizzle with their own schemas independently.
 *
 * TYPICAL SERVICE SETUP:
 * ```typescript
 * import { createPool, drainPool } from '@fintech/shared-db';
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import * as schema from './db/schema';
 *
 * const pool = createPool(config.DATABASE_URL, {
 *   application_name: config.SERVICE_NAME,
 * });
 * export const db = drizzle(pool, { schema });
 *
 * process.on('SIGTERM', async () => { await drainPool(pool); process.exit(0); });
 * ```
 */

export { createPool, drainPool } from './client';
export { withTransaction } from './transaction';
export { encodeCursor, decodeCursor, buildCursorWhereClause } from './paginate';
export type { CursorClause } from './paginate';
