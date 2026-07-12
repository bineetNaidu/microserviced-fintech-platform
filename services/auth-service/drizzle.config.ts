import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration file.
 * Manages automated PostgreSQL schema migration generation.
 *
 * Runs locally to compare Drizzle schema in schema.ts with migrations folder:
 *   npx drizzle-kit generate
 *
 * Utilizes direct process.env mapping with fallbacks to prevent Zod verification
 * failures from aborting code generation steps in non-configured environments.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://fintech_user:change_me_in_production@localhost:5432/auth_db', //process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
