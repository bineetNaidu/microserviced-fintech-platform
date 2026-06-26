# Production-Grade Distributed Fintech Platform

A high-performance, resilient, and production-inspired fintech platform designed to mirror how financial architectures are engineered at companies like Stripe, Razorpay, and Wise. Moving away from traditional, mutable CRUD systems, this platform is built on an event-driven, append-only double-entry ledger architecture to ensure absolute correctness and auditing precision.

## 🛠️ Technology Stack & Rationale

- **Runtime & Language:** Node.js with TypeScript for type-safety across distributed microservices.
- **API Layer:** Express.js for explicit, minimal, and secure HTTP routing middleware control.
- **Financial Record Storage:** PostgreSQL providing strong ACID compliance for ledger durability.
- **Asynchronous Streaming:** RabbitMQ acting as the AMQP messaging broker handling at-least-once event delivery.
- **Distributed Caching & Invalidation:** Redis managing idempotency keys, token blocklists, and rate limits.
- **Monorepo Workspace Tooling:** Standard **npm workspaces** for native package coordination.
- **Orchestration & Scale:** Kubernetes using Kustomize overlays for automated health tracking and scaling boundaries.
- **Observability Matrix:** OpenTelemetry, Jaeger, Prometheus, and Grafana tracking the Four Golden Signals.

---

## 🏛️ Core Architectural Foundations

### 1. Money is an Integer (Paise)

To avoid standard floating-point precision errors (`0.1 + 0.2 = 0.30000000000000004`), all monetary interactions are executed and stored as 64-bit positive integers (`BIGINT`) in the smallest fractional currency denomination (paise for INR, where ₹500 is stored as `50000`).

### 2. Double-Entry Accounting Ledger

Balances are never stored as mutable single numbers or column rows. Account balances are dynamically derived on-demand by summing an append-only transaction table of immutable ledger entries (`Total Debits = Total Credits`).

### 3. Orchestrated Saga Pattern

Money movement is a multi-service distributed process. The Transfer Service acts as a central orchestrator, executing local transactions across different databases and running compensating reversals if a downstream step fails mid-process, moving all funds securely through a transient suspense transit account.

### 4. Idempotency Over Network Retries

All system components are safe to retry. Write-heavy HTTP layers enforce unique client-provided `Idempotency-Key` tracking in Redis, while RabbitMQ consumers evaluate an atomic `processed_events` logging table inside database transaction scopes to guarantee safe execution.

---

## 📁 Repository Workspace Blueprint

This repository is managed using **npm workspaces** split into three core root directories: `apps/`, `services/`, and `packages/`.

```text
fintech-platform/
├── apps/
│   └── web/                          # Next.js Frontend Application
│       ├── src/
│       │   ├── app/                  # Next.js App Router folders
│       │   │   ├── (auth)/           # Route Group: login, register
│       │   │   └── (dashboard)/      # Route Group: accounts, transfers
│       │   ├── components/           # UI elements (Tailwind + Framer Motion)
│       │   └── lib/                  # API clients, custom hooks
│       └── package.json              # name: "@fintech/web"
│
├── services/                         # Core Backend Microservices
│   ├── api-gateway/                  # Entry point for traffic
│   │   ├── src/                      # Express Reverse Proxy Server
│   │   └── package.json              # name: "@fintech/api-gateway"
│   ├── auth-service/                 # Identity, tokens, bcrypt, sessions
│   │   ├── src/
│   │   ├── db/migrations/            # Auth schema SQL adjustments
│   │   └── package.json              # name: "@fintech/auth-service"
│   ├── user-service/                 # Profiles, KYC, user preferences
│   │   ├── src/
│   │   ├── db/migrations/            # Profile SQL tables
│   │   └── package.json              # name: "@fintech/user-service"
│   ├── account-service/              # Account validation, ownership, limits
│   │   ├── src/
│   │   ├── db/migrations/            # Account state structures
│   │   └── package.json              # name: "@fintech/account-service"
│   ├── ledger-service/               # Immutable Double-Entry Engine
│   │   ├── src/
│   │   ├── db/migrations/            # Ledger accounting schemas
│   │   └── package.json              # name: "@fintech/ledger-service"
│   ├── transfer-service/             # Transfer Saga Orchestrator
│   │   ├── src/
│   │   ├── db/migrations/            # Transfer state tracking
│   │   └── package.json              # name: "@fintech/transfer-service"
│   ├── deposit-service/              # Deposit callbacks, admin credits
│   │   ├── src/
│   │   ├── db/migrations/            # Inflow payment structures
│   │   └── package.json              # name: "@fintech/deposit-service"
│   ├── approval-service/             # Human manager approval checks
│   ├── notification-service/         # User notifications via event streams
│   ├── audit-service/                # Immutable tamper-proof platform audit log
│   ├── reporting-service/            # Aggregated CQRS read-models
│   ├── scheduler-service/            # Distributed locking tasks (Cron jobs)
│   └── operations-service/           # Admin emergency configurations
│
├── packages/                         # Shared Glue Infrastructure
│   ├── shared-types/                 # Unified Domain TS Interfaces
│   │   ├── src/
│   │   └── package.json              # name: "@fintech/shared-types"
│   ├── shared-errors/                # Standardised BaseApp errors
│   │   ├── src/
│   │   └── package.json              # name: "@fintech/shared-errors"
│   ├── shared-events/                # RabbitMQ contract definitions
│   │   ├── src/
│   │   └── package.json              # name: "@fintech/shared-events"
│   ├── shared-middleware/            # Correlation, logging, RBAC guards
│   ├── shared-db/                    # Knex/pg connection pools, paging tools
│   ├── shared-messaging/             # RabbitMQ client abstraction
│   └── shared-config/                # Global Zod configuration engine
│
├── infra/                            # Operational Configurations
│   ├── docker/                       # Dockerfiles per microservice
│   ├── postgres/                     # DB init routing tables
│   └── rabbitmq/                     # Virtual host definitions
│
├── k8s/                              # Kubernetes Resource Control
│   ├── base/                         # Core service definitions
│   └── overlays/                     # Environment patches (local, prod)
│
└── docs/                             # Engineering Knowledge Vault
    └── architecture/
        └── adr/                      # Architecture Decision Records
```

### 📦 Clean Architecture Blueprint

Every microservice inside the `services/` folder applies an identical structure to enforce decoupling:

```plaintext
src/
├── server.ts              # Entry-point (Initializes DB, Event loops)
├── app.ts                 # Instantiates Express instance hooks
├── config/                # Service Zod parsed env configurations
├── routes/                # HTTP path mapping endpoints
├── controllers/           # Slim parsing layer for API inputs
├── services/              # Pure domain business engine layer
├── repositories/          # Isolated raw database operations layer
├── events/                # Dedicated publishers & consumers
└── validators/            # Zod validation parameter guards
```

- `routes/` — Clear HTTP mapping path declarations.
- `controllers/` — Slim parsing layers extracting parameters from the incoming payload.
- `services/` — Pure core business logic engines (decoupled from direct HTTP concepts).
- `repositories/` — Isolated data-access logic containing all raw SQL operations.
- `events/` — Specialized RabbitMQ message publishers and queue message consumers.

---

## 🚀 Quality Controls & Git Workflow

This repository uses automated code styling and sanity checks on every single commit via Git hooks.

- **Linting and Formatting:** Automated tracking using ESLint and Prettier.
- **Trunk-Based Guards:** Husky combined with `lint-staged` blocks incomplete edits from hitting Git records.
- **Commit Message Convention:** Follows the **Conventional Commits** specification (`feat(transfer): description`, `fix(ledger): description`).

### Core Commands

```bash
# Install dependencies across all workspaces
npm install

# Run build tasks sequentially according to the dependency graph
npm run build

# Audit code styling constraints across the repository
npm run lint

# Run individual unit testing configurations
npm run test:unit

```
