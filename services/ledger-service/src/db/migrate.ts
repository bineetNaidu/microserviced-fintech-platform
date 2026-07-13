import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool, drainPool } from '@fintech/shared-db';
import * as path from 'path';

/**
 * Executes Drizzle SQL migrations against the configured ledger_db target.
 * Also configures the application_runtime_user privileges for database-level immutability enforcement.
 */
async function runMigration() {
  console.log('⏳ Running ledger-service database migrations...');

  const dbUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(
      '❌ MIGRATION_DATABASE_URL or DATABASE_URL is not defined in environment variables.',
    );
    process.exit(1);
  }

  const pool = createPool(dbUrl, {
    max: 1,
  });

  const db = drizzle(pool);

  try {
    // ─── 1. RUN SCHEMA MIGRATIONS ────────────────────────────────────────────
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '../../db/migrations'),
    });
    console.log('✅ Schema migrations completed successfully!');

    // ─── 2. PROVISION RUNTIME ROLE AND IMMUTABILITY PRIVILEGES ──────────────────
    console.log('⏳ Setting database immutability controls and provisioning runtime role...');
    const client = await pool.connect();
    try {
      // Create restricted login user if it does not exist
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'application_runtime_user') THEN
            CREATE ROLE application_runtime_user WITH LOGIN PASSWORD 'runtime_pass';
          END IF;
        END
        $$;
      `);

      // Grant connection and operational capabilities on public schema
      await client.query(`
        GRANT CONNECT ON DATABASE ledger_db TO application_runtime_user;
        GRANT USAGE ON SCHEMA public TO application_runtime_user;
        GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO application_runtime_user;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO application_runtime_user;
      `);

      // Revoke UPDATE and DELETE access on core ledger tables to enforce strict financial audit laws
      await client.query(`
        REVOKE UPDATE, DELETE ON TABLE ledger_transactions FROM application_runtime_user;
        REVOKE UPDATE, DELETE ON TABLE ledger_entries FROM application_runtime_user;
      `);

      console.log('✅ Database immutability controls and runtime privileges provisioned.');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await drainPool(pool);
  }
}

runMigration();
