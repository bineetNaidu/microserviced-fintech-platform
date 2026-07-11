-- ─────────────────────────────────────────────────────────────────────────────
-- PostgreSQL Database Initialization Script
--
-- This script runs ONCE on the very first `docker compose up` (when the
-- postgres_data volume is empty). It creates an isolated database for each
-- microservice following the Database-per-Service pattern (ADR-002).
--
-- ─── WHY DATABASE-PER-SERVICE? (ADR-002) ─────────────────────────────────────
-- Sharing a single database across all services creates tight coupling:
--   • A schema change in auth_db could require coordinated deploys of 13 services
--   • A slow query in user_db could starve connections for the ledger_db
--   • You can't scale storage independently per service
--
-- With isolated databases:
--   • Each service owns its schema — no cross-service schema dependencies
--   • Each database can be moved to a dedicated host/cluster as load grows
--   • Services communicate via events (RabbitMQ), not shared database joins
--
-- ─── IMPORTANT ───────────────────────────────────────────────────────────────
-- This file only creates DATABASES (not tables). Each service's Drizzle migrations
-- create the tables when the service boots up (`npm run db:migrate`).
-- ─────────────────────────────────────────────────────────────────────────────

-- Auth Service database — users, sessions, email/password tokens
CREATE DATABASE auth_db;

-- User Service database — user profiles, KYC documents
CREATE DATABASE user_db;

-- Account Service database — financial accounts, balances
CREATE DATABASE account_db;

-- Transfer Service database — transfer saga state, idempotency keys
CREATE DATABASE transfer_db;

-- Ledger Service database — double-entry accounting journal entries (ADR-003)
CREATE DATABASE ledger_db;

-- Approval Service database — maker-checker workflow requests
CREATE DATABASE approval_db;

-- Audit Service database — append-only compliance audit log (ADR-014)
CREATE DATABASE audit_db;

-- Operations Service database — system configs, global blocklists
CREATE DATABASE operations_db;

-- Deposit Service database — deposit records and status tracking
CREATE DATABASE deposit_db;

-- Notification Service database — notification delivery state
CREATE DATABASE notification_db;

-- Reporting Service database — aggregated reporting snapshots (ADR-017)
CREATE DATABASE reporting_db;

-- Scheduler Service database — cron job state and execution history
CREATE DATABASE scheduler_db;
