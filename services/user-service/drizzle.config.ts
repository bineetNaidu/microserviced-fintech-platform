import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration file.
 * Manages automated PostgreSQL schema migration generation.
 *
 * Runs locally to compare Drizzle schema in schema.ts with migrations folder:
 *   npx drizzle-kit generate
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
