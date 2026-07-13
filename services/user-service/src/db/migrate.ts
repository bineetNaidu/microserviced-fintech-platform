import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, drainPool } from '@fintech/shared-db';
import * as path from 'path';

/**
 * Executes Drizzle SQL migrations against the configured user_db target.
 */
async function runMigration() {
  console.log('⏳ Running user-service database migrations...');

  const pool = createPool(process.env.DATABASE_URL!, {
    max: 1,
  });

  const db = drizzle(pool);

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '../../db/migrations'),
    });
    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await drainPool(pool);
  }
}

runMigration();
