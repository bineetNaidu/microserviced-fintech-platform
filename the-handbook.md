# The Fintech Platform Architecture Handbook

## Chapter 1: Project Vision, Philosophy & Foundational Concepts

---

### 1.1 What You Are Building — And Why It Matters

Most developers learn backend engineering by building CRUD applications. A CRUD app is one where you Create, Read, Update, and Delete records. A simple banking app might store a user's balance as a single number in a database row, and when Alice sends money to Bob, you subtract from Alice's row and add to Bob's row. This works in a tutorial. It fails catastrophically in production.

This handbook guides you to build something fundamentally different: a **production-inspired fintech platform** that mirrors how real financial systems are engineered at companies like Stripe, Razorpay, PhonePe, Wise, or N26.

The distinction is not cosmetic. It is architectural. Real fintech systems must answer questions like:

- What happens if the database write succeeds for Alice but fails for Bob? Is money created from nowhere, or destroyed entirely?
- What happens if the same payment request is sent twice due to a network retry? Do we charge twice?
- What happens if a service crashes mid-transfer, after money has left Alice's account but before it has arrived in Bob's?
- How do we know *who* changed *what* and *when*, with irrefutable evidence?
- How do we scale the payment processing component independently of the user management component?
- How do we detect that a service is degrading before it completely fails?

These are not edge cases. These are the everyday realities of financial systems. This project teaches you to design and build systems that handle them correctly.

---

### 1.2 The Mental Model: From Monolith to Distributed System

When you write a simple Node.js application, everything lives in one process. Your user logic, your payment logic, your notification logic — all of it runs together. This is called a **monolith**. Monoliths are not inherently bad. They are easy to develop and debug in the early stages of a product. But they have a ceiling.

Imagine your payment processing function starts consuming excessive CPU during a sale. In a monolith, this slows down *every other feature too* — including login, which is computationally cheap. You cannot scale one part without scaling everything. You cannot deploy a fix to the notification system without redeploying the payment system. You cannot let a junior developer work on the user profile feature without giving them access to the payment code.

A **distributed system** breaks these concerns apart. Each concern becomes a separate, independently deployable unit called a **service** or **microservice**. These services communicate with each other over a network — sometimes directly (HTTP), sometimes indirectly through a message queue.

This introduces new problems: network latency, partial failures, data consistency across services. The rest of this handbook is essentially a structured tour of how to solve these problems gracefully.

---

### 1.3 The Philosophy of This Project

Before we write a single line of design, internalize these principles. They inform every decision made throughout this system.

**Correctness over speed.** In fintech, a bug that sends money to the wrong account, or fails to send it at all, is not a UX inconvenience. It is a regulatory and legal event. The system must be designed to be correct first. Performance is optimized within the constraints of correctness.

**Explicit over implicit.** Every financial state change must be recorded explicitly. We do not infer what happened from the current state. We store every event, every entry, every mutation with a full audit trail. If something goes wrong, you must be able to reconstruct *exactly* what happened and in what order.

**Immutability of financial records.** Once a ledger entry is written, it is never modified or deleted. Corrections are made by writing new, offsetting entries. This is not a technical preference — it is an accounting principle with legal standing.

**Idempotency by design.** Any operation that involves money must be safe to retry. If a client sends a payment request, loses the connection, and sends the same request again, the system must recognize it as a duplicate and not process it twice. This is designed in from the start, not bolted on.

**Failure is normal.** Services crash. Networks partition. Databases timeout. The system must be designed to detect failures, recover from them, and — critically — leave the data in a consistent state regardless of where the failure occurred.

**Observability is not optional.** You cannot fix what you cannot see. Every service must emit logs, metrics, and traces that allow you to understand system behaviour in real time. In production fintech, observability is as important as the business logic itself.

---

### 1.4 The Technology Stack — Rationale

You were given a technology stack. Here is *why* each piece was chosen, which matters more than knowing what it is.

**Node.js and TypeScript** are your application runtime and language. Node.js handles I/O-heavy workloads efficiently, which is the dominant workload in backend services that talk to databases and message queues. TypeScript gives you compile-time type safety, which is essential in a system where data flows across many service boundaries. Without types, you are guessing what shape a message from another service will arrive in.

**Express.js** is your HTTP framework. It is deliberately minimal, giving you explicit control over middleware, routing, and request handling. This explicitness is valuable when building secure, auditable financial APIs.

**PostgreSQL** is your primary database. It is a relational database with excellent ACID compliance — meaning it gives you Atomicity (all-or-nothing writes), Consistency (data always obeys constraints), Isolation (concurrent writes don't corrupt each other), and Durability (committed data survives crashes). These properties are foundational requirements for financial data.

**Redis** serves two purposes: caching frequently read data to reduce database load, and acting as a fast key-value store for session tokens, rate limiting state, and idempotency records.

**RabbitMQ** is your message broker. When services need to communicate without being directly coupled to each other, they publish messages to RabbitMQ. Other services subscribe to those messages and process them. This is the backbone of your event-driven architecture.

**Kubernetes** orchestrates your containerised services. It handles deployment, scaling, self-healing (restarting crashed containers), and service discovery. Think of it as an operating system for your distributed system.

**Prometheus, Grafana, OpenTelemetry, and Jaeger** are your observability stack. Prometheus collects numeric metrics (request rates, error rates, latencies). Grafana visualises those metrics as dashboards. OpenTelemetry is a standardised way of instrumenting your code so it emits traces — records of how a request flowed through multiple services. Jaeger stores and visualises those traces.

**Vitest/Jest, Supertest, Playwright, and k6** cover different layers of your testing strategy: unit tests, integration tests, end-to-end browser tests, and load tests respectively.

---

### 1.5 What "Production-Grade" Actually Means

The phrase "production-grade" is overused. Here is a concrete definition for this project.

A production-grade system:

1. **Handles concurrent users without data corruption.** Two people can send money at the same time and neither loses money or gains extra.

2. **Survives partial failures gracefully.** If the Notification Service crashes while a transfer is processing, the transfer still completes. The notification may be delayed, but the money moves correctly.

3. **Has a full audit trail.** Every action taken in the system — every login, every transfer, every admin override — is recorded with the actor's identity, a timestamp, and a reason where applicable. This trail cannot be tampered with.

4. **Enforces access control precisely.** A customer cannot see another customer's account. A support agent can view accounts but not initiate transfers. An auditor can read everything but write nothing.

5. **Can be deployed, updated, and rolled back without downtime.** Services can be updated independently. If a bad deployment is pushed, it can be rolled back without affecting other services.

6. **Emits sufficient signals for diagnosis.** When something goes wrong at 3am, an engineer can look at logs, metrics, and traces and understand what happened, which service caused it, and how to fix it.

7. **Has automated tests that provide confidence for change.** Before any code is deployed, an automated test suite runs and confirms that the system behaves correctly. This gives you the freedom to refactor without fear.

This project is designed to teach and demonstrate all seven of these properties.

---

### 1.6 The Financial Domain — Key Concepts You Must Understand First

Before you can design a fintech system, you must understand the financial concepts it implements. These are not software concepts. They are accounting concepts. Software engineers working in fintech must be fluent in them.

#### Money is not a number

In software, you might represent money as a floating-point number like `499.99`. This is wrong. Floating-point arithmetic is imprecise. `0.1 + 0.2` in JavaScript is `0.30000000000000004`. In most applications this does not matter. In financial systems, it matters enormously — because you are dealing with real money, and rounding errors accumulate.

The correct approach is to store money as an **integer in the smallest denomination**. In Indian Rupees, the smallest denomination is a paisa (1/100 of a rupee). So ₹500 is stored as the integer `50000`. All arithmetic is done in integers. Conversion to rupees for display happens only at the presentation layer.

This project will always store monetary amounts in paise.

#### Accounts are not balance containers

A common beginner model of a bank account is: "it is a row in a table with a `balance` column." This model breaks in multiple ways. If two transfers happen simultaneously and both read the balance before either writes it back, you get the classic **race condition**: money is duplicated or destroyed.

More importantly, this model loses history. You cannot answer "what was this account's balance at 3pm on Tuesday?" A balance column tells you what the balance *is right now*. That is all.

The correct model, which this system implements, is the **double-entry ledger**. We will cover this in full detail in Chapter 3. For now, understand that: an account's balance is not stored. It is *calculated* by summing all the entries associated with that account. The entries are immutable. The balance is derived.

#### Transfers are processes, not operations

Moving money from Alice to Bob is not a single database write. It is a **process** with multiple steps that can each succeed or fail independently:

1. Validate that Alice has sufficient funds.
2. Debit Alice's account.
3. Credit Bob's account.
4. Notify Alice and Bob.
5. Record the transfer in the transfer history.

If step 3 fails after step 2 has already succeeded, the system is in an inconsistent state. Money has left Alice but not arrived at Bob. Your system must detect this, attempt recovery, and if recovery fails, reverse the debit on Alice's account so no money is lost. This recovery process is called a **compensation** or **rollback**, and the pattern for managing it in distributed systems is called the **Saga Pattern** (covered in Chapter 9).

---

### 1.7 The System at a High Level

Before diving into the detailed design of each service, it helps to hold the whole system in your mind at once.

At the outermost layer, users interact with a **Next.js frontend**. This frontend communicates exclusively with an **API Gateway**, which is the single entry point to the backend. The gateway handles authentication, rate limiting, and routes requests to the appropriate downstream service.

Behind the gateway, thirteen services handle distinct business domains:

- **Auth Service** — who you are (identity, tokens)
- **User Service** — what your profile looks like
- **Account Service** — what accounts you own and their state
- **Ledger Service** — the immutable record of every financial event
- **Transfer Service** — orchestrates the movement of money
- **Deposit Service** — handles money entering the system
- **Approval Service** — human approval workflows for sensitive actions
- **Notification Service** — tells users what happened
- **Audit Service** — records every significant system event
- **Reporting Service** — aggregates data for dashboards and reports
- **Scheduler Service** — runs transfers and tasks at scheduled times
- **Operations Service** — admin tools for system operators

These services communicate in two ways. For operations that need an immediate response (such as "check if this account exists"), they call each other directly over HTTP. For events that other services need to react to but that do not need to block the current request (such as "a transfer was completed, please notify the user"), they publish events to **RabbitMQ**.

Every service has its own dedicated **PostgreSQL database**. No service reads directly from another service's database. This is a hard rule. If Service A needs data that Service B owns, Service A must ask Service B for it via an API call, or Service B must publish the data as an event that Service A can subscribe to and store locally.

This separation — called **database-per-service** — is what makes each service truly independent. It means you can change the internal database schema of the Ledger Service without affecting any other service. It means you can take the User Service database down for maintenance without affecting the Transfer Service's ability to process payments.

---

### 1.8 How to Use This Handbook

This handbook is structured as a progression. Each chapter builds on the previous one. Do not skip chapters, even if you feel confident about the topic. The financial and distributed systems concepts compound — understanding why double-entry accounting is designed as it is informs how you design the Ledger Service's API, which informs how the Transfer Service constructs Saga steps, which informs how the Observability stack traces cross-service flows.

The recommended reading and building order is:

1. Read Chapters 1–4 fully before writing any code. These cover the foundational concepts and system design.
2. Follow the Implementation Roadmap in Chapter 15, which sequences the building work across milestones.
3. Return to the relevant service chapter whenever you are building that service.
4. Use the Event Catalog and Database Design chapters as reference documents throughout.

Each chapter concludes with a **Key Concepts** summary and a **Before You Continue** checklist of things you should be able to explain in your own words before moving on.

---

### Key Concepts — Chapter 1

- A fintech platform differs from a CRUD app in its requirements for correctness, auditability, and failure recovery.
- Money should always be stored as an integer in the smallest denomination (paise for INR).
- An account's balance is calculated from ledger entries, not stored as a single value.
- A transfer is a multi-step process that can partially fail — the system must handle this.
- Microservices own their own databases and communicate via HTTP or message queues.
- Production-grade means: concurrent safety, failure recovery, full audit trails, precise access control, independent deployability, observability, and test coverage.

---

### Before You Continue — Chapter 1 Checklist

Before reading Chapter 2, you should be able to answer these in your own words:

1. Why is storing money as a floating-point number dangerous?
2. What is the difference between a monolith and a distributed system?
3. Why does each microservice have its own database?
4. What does "idempotency" mean in the context of a payment operation?
5. Name three ways this system differs from a simple banking CRUD app.

---

## Chapter 2: Monorepo Structure, Project Layout & Developer Environment

---

### 2.1 What Is a Monorepo and Why Use One?

Before discussing folder structures, you need to understand the strategic decision being made here.

You have thirteen services, a frontend application, shared TypeScript types, shared utility libraries, infrastructure configuration, Kubernetes manifests, and documentation. These could live in separate Git repositories — one per service. This is called a **polyrepo** approach. Many large companies use it. But for a single developer building a learning project that needs to demonstrate cross-cutting concerns, a polyrepo creates unnecessary friction.

A **monorepo** is a single Git repository that contains all of these things together. The word "mono" refers to the repository, not to the architecture. Your system is still a microservices architecture with independent services. They simply live in the same codebase.

The advantages for this project are significant.

**Atomic changes across service boundaries.** When you add a new event type that the Transfer Service publishes and the Notification Service consumes, you need to update the shared event type definition, the Transfer Service, and the Notification Service. In a polyrepo, this requires three separate commits across three repositories, coordinated carefully to avoid breaking changes. In a monorepo, it is one commit that touches all three locations simultaneously. Reviewers can see the full picture.

**Shared packages without publishing.** Your thirteen services will all need to validate monetary amounts, format error responses in a consistent structure, and work with the same TypeScript types for events and DTOs. In a polyrepo, you would publish these as npm packages and version them. In a monorepo, every service imports them directly from a shared `packages/` directory. No publishing, no version drift, no "Service A is using v1.2 of the shared types but Service B is using v1.4" problems.

**Unified tooling.** One ESLint configuration, one TypeScript base configuration, one testing setup, one CI pipeline definition. Changes to shared tooling propagate everywhere immediately.

**Simplified local development.** You can start all services with a single command. You can run all tests across all services with a single command.

The tool that makes this practical is **pnpm workspaces**, which understands that your repository contains multiple packages and manages their dependencies intelligently, hoisting shared dependencies to the root to avoid duplication while allowing each package to have its own `package.json`.

---

### 2.2 The Workspace Tool: pnpm

You may be familiar with npm or yarn. **pnpm** is a package manager with a key architectural difference: it stores packages in a content-addressable store on your machine and uses hard links rather than copying files into each project's `node_modules`. The practical effects are faster installs, dramatically less disk usage, and first-class monorepo support through its workspaces feature.

In a pnpm workspace, you define which directories are "packages" in a `pnpm-workspace.yaml` file at the root. When you run `pnpm install` at the root, pnpm installs all dependencies for all packages in the workspace, resolving shared dependencies efficiently.

Each package in the workspace has its own `package.json` with a unique `name` field. Packages can depend on each other using the workspace protocol: `"@fintech/shared-types": "workspace:*"` means "use the version of `@fintech/shared-types` that exists in this monorepo, whatever version it is."

---

### 2.3 The Top-Level Structure

Here is the complete top-level layout of the monorepo. Every folder is explained in detail below.

```
fintech-platform/
│
├── apps/
│   └── web/                          # Next.js frontend application
│
├── services/
│   ├── api-gateway/                  # Entry point for all client traffic
│   ├── auth-service/                 # Authentication and token management
│   ├── user-service/                 # User profile management
│   ├── account-service/              # Account ownership and state
│   ├── ledger-service/               # Double-entry accounting ledger
│   ├── transfer-service/             # Money movement orchestration
│   ├── deposit-service/              # Money entering the system
│   ├── approval-service/             # Human approval workflows
│   ├── notification-service/         # User notifications
│   ├── audit-service/                # Immutable system event log
│   ├── reporting-service/            # Aggregated data and reports
│   ├── scheduler-service/            # Scheduled task execution
│   └── operations-service/           # Admin and operator tools
│
├── packages/
│   ├── shared-types/                 # TypeScript types used across services
│   ├── shared-errors/                # Standardised error classes
│   ├── shared-events/                # RabbitMQ event type definitions
│   ├── shared-middleware/            # Express middleware (auth, logging, etc.)
│   ├── shared-db/                    # Database utilities and base patterns
│   ├── shared-messaging/             # RabbitMQ client wrapper
│   └── shared-config/                # Environment variable validation
│
├── infra/
│   ├── docker/                       # Dockerfiles for each service
│   ├── postgres/                     # DB init scripts, migrations baseline
│   └── rabbitmq/                     # RabbitMQ topology definitions
│
├── k8s/
│   ├── base/                         # Base Kubernetes manifests
│   ├── overlays/
│   │   ├── local/                    # Local development overrides
│   │   ├── staging/                  # Staging environment overrides
│   │   └── production/               # Production overrides
│   └── charts/                       # Helm charts (optional, later)
│
├── docs/
│   ├── architecture/                 # Architecture decision records
│   ├── api/                          # OpenAPI specifications
│   ├── runbooks/                     # Incident response procedures
│   └── diagrams/                     # System and flow diagrams
│
├── scripts/
│   ├── dev/                          # Local development helper scripts
│   ├── db/                           # Database migration and seeding scripts
│   ├── test/                         # Test orchestration scripts
│   └── ci/                           # CI pipeline helper scripts
│
├── .github/
│   └── workflows/                    # GitHub Actions CI/CD pipelines
│
├── docker-compose.yml                # Local infrastructure orchestration
├── docker-compose.override.yml       # Local development overrides
├── pnpm-workspace.yaml               # Workspace package declarations
├── package.json                      # Root package.json with workspace scripts
├── tsconfig.base.json                # Shared TypeScript configuration
├── .eslintrc.base.js                 # Shared ESLint configuration
├── .env.example                      # Template for environment variables
└── README.md                         # Project overview and quickstart
```

---

### 2.4 The `apps/` Directory

The `apps/` directory contains deployable applications that are primarily consumer-facing rather than backend services. In this project, there is one: the Next.js frontend.

The reason for separating `apps/` from `services/` is semantic clarity. Services are backend processes that expose APIs and process events. Apps are what users directly interact with. As the system grows, you might add a mobile app backend-for-frontend here, or an internal admin dashboard that is distinct from the main operations service.

```
apps/
└── web/
    ├── src/
    │   ├── app/                      # Next.js App Router pages
    │   │   ├── (auth)/               # Route group: login, register
    │   │   ├── (dashboard)/          # Route group: authenticated pages
    │   │   │   ├── accounts/         # Account overview and detail
    │   │   │   ├── transfers/        # Transfer history and initiation
    │   │   │   ├── ledger/           # Ledger history view
    │   │   │   └── settings/         # User settings
    │   │   └── layout.tsx            # Root layout
    │   ├── components/
    │   │   ├── ui/                   # Generic UI components
    │   │   ├── accounts/             # Account-specific components
    │   │   ├── transfers/            # Transfer-specific components
    │   │   └── shared/               # Shared layout components
    │   ├── lib/
    │   │   ├── api/                  # API client functions
    │   │   ├── hooks/                # Custom React hooks
    │   │   └── utils/                # Utility functions
    │   └── types/                    # Frontend-specific types
    ├── public/                       # Static assets
    ├── package.json
    ├── tsconfig.json                 # Extends ../../tsconfig.base.json
    └── next.config.ts
```

---

### 2.5 The `services/` Directory

This is where the core of the system lives. Each service directory follows an identical internal structure. This uniformity is deliberate and important — when you open any service's folder, you immediately know where everything is. This consistency reduces cognitive overhead enormously when working across many services.

Here is the standard internal structure for every service. We will use `transfer-service` as the example:

```
services/transfer-service/
│
├── src/
│   ├── app.ts                        # Express app setup (no server.listen here)
│   ├── server.ts                     # Entry point: creates HTTP server, connects DB
│   ├── config/
│   │   └── index.ts                  # Validated environment configuration
│   ├── routes/
│   │   ├── index.ts                  # Mounts all route groups
│   │   └── v1/
│   │       ├── transfer.routes.ts    # Route definitions (paths + middleware)
│   │       └── health.routes.ts      # /health and /ready endpoints
│   ├── controllers/
│   │   └── transfer.controller.ts   # HTTP request handlers (thin layer)
│   ├── services/
│   │   └── transfer.service.ts      # Business logic (the core)
│   ├── repositories/
│   │   └── transfer.repository.ts   # All database queries (no logic)
│   ├── events/
│   │   ├── publishers/
│   │   │   └── transfer.publisher.ts # Publishes events to RabbitMQ
│   │   └── consumers/
│   │       └── approval.consumer.ts  # Consumes approval.approved events
│   ├── middleware/
│   │   └── transfer.middleware.ts    # Route-specific middleware
│   ├── validators/
│   │   └── transfer.validator.ts     # Request body validation schemas
│   ├── types/
│   │   └── transfer.types.ts         # Service-local types
│   └── utils/
│       └── transfer.utils.ts         # Service-local utilities
│
├── db/
│   └── migrations/                   # SQL migration files (numbered)
│       ├── 001_create_transfers.sql
│       ├── 002_create_transfer_events.sql
│       └── 003_add_idempotency_key.sql
│
├── tests/
│   ├── unit/
│   │   ├── transfer.service.test.ts
│   │   └── transfer.utils.test.ts
│   ├── integration/
│   │   └── transfer.api.test.ts
│   └── fixtures/
│       └── transfer.fixtures.ts      # Test data factories
│
├── Dockerfile                        # Production Docker image
├── package.json
├── tsconfig.json                     # Extends ../../tsconfig.base.json
└── .env.example                      # Service-specific env var template
```

Let us examine each layer in detail, because the separation of concerns here is critical and non-obvious.

**`routes/`** contains only route *declarations* — the mapping between an HTTP method and path, and the chain of middleware and controller functions that handle it. There is no logic here. A route file reads like a table of contents for the API.

**`controllers/`** contains *request handlers*. A controller's job is to extract data from the HTTP request (path params, query params, request body, authenticated user identity), call the appropriate service function with that data, and format the response. Controllers do not contain business logic. They do not talk to the database. They are the translation layer between HTTP and your domain logic.

**`services/`** contains *business logic*. This is where the rules of your domain live. The transfer service's service layer decides whether a transfer is valid, orchestrates the steps of the Saga, and decides what events to publish. Service functions receive plain data objects, not HTTP request objects. This separation means your business logic can be tested without starting an HTTP server.

**`repositories/`** contains *data access logic*. Every database query lives here. A repository function takes parameters and returns domain objects. It knows about SQL and your database schema. It does not know about business rules. This separation means you can swap your database driver or ORM without touching your business logic.

**`events/`** contains *messaging logic*. Publishers know how to format and send events to RabbitMQ. Consumers know how to receive and parse events. Event logic is isolated here so it does not pollute your business logic.

**`validators/`** contains *input validation schemas*. These are defined using a schema validation library like Zod. They run before your controller code and reject malformed requests early. Validation logic does not belong in controllers or services.

This layered architecture is sometimes called **Clean Architecture** or **Layered Architecture**. The key principle is the **Dependency Rule**: outer layers can depend on inner layers, but inner layers must never depend on outer layers. Your repository knows nothing about HTTP. Your service knows nothing about RabbitMQ message formats. Your controller knows nothing about SQL.

---

### 2.6 The `packages/` Directory

Shared packages are the glue of your monorepo. Each package is a TypeScript library that can be imported by any service or app. Here is what each one contains and why it exists.

```
packages/
│
├── shared-types/
│   ├── src/
│   │   ├── domain/                   # Core domain model types
│   │   │   ├── user.types.ts
│   │   │   ├── account.types.ts
│   │   │   ├── transfer.types.ts
│   │   │   └── ledger.types.ts
│   │   ├── api/                      # Request and response DTOs
│   │   │   ├── transfer.dto.ts
│   │   │   └── account.dto.ts
│   │   └── index.ts                  # Re-exports everything
│   └── package.json                  # name: "@fintech/shared-types"
│
├── shared-errors/
│   ├── src/
│   │   ├── base.error.ts             # Base AppError class
│   │   ├── domain.errors.ts          # InsufficientFundsError, etc.
│   │   ├── http.errors.ts            # NotFoundError, UnauthorizedError, etc.
│   │   └── index.ts
│   └── package.json                  # name: "@fintech/shared-errors"
│
├── shared-events/
│   ├── src/
│   │   ├── transfer.events.ts        # TransferRequestedEvent, etc.
│   │   ├── account.events.ts         # AccountCreatedEvent, etc.
│   │   ├── ledger.events.ts
│   │   └── index.ts
│   └── package.json                  # name: "@fintech/shared-events"
│
├── shared-middleware/
│   ├── src/
│   │   ├── authenticate.ts           # JWT verification middleware
│   │   ├── authorize.ts              # RBAC enforcement middleware
│   │   ├── correlationId.ts          # Attaches X-Correlation-ID to requests
│   │   ├── requestLogger.ts          # Structured request/response logging
│   │   ├── errorHandler.ts           # Centralised Express error handler
│   │   ├── rateLimiter.ts            # Redis-backed rate limiting
│   │   └── index.ts
│   └── package.json                  # name: "@fintech/shared-middleware"
│
├── shared-db/
│   ├── src/
│   │   ├── client.ts                 # PostgreSQL connection pool factory
│   │   ├── transaction.ts            # Transaction helper utilities
│   │   ├── paginate.ts               # Cursor and offset pagination helpers
│   │   └── index.ts
│   └── package.json                  # name: "@fintech/shared-db"
│
├── shared-messaging/
│   ├── src/
│   │   ├── connection.ts             # RabbitMQ connection management
│   │   ├── publisher.ts              # Message publishing with retry
│   │   ├── consumer.ts               # Message consumption with DLQ support
│   │   ├── topology.ts               # Exchange and queue declarations
│   │   └── index.ts
│   └── package.json                  # name: "@fintech/shared-messaging"
│
└── shared-config/
    ├── src/
    │   ├── env.ts                    # Zod-based environment variable parser
    │   └── index.ts
    └── package.json                  # name: "@fintech/shared-config"
```

The reason these packages exist as separate workspace packages rather than a single `shared/` folder is that each one has a distinct responsibility and distinct consumers. Not every service needs the messaging package. The frontend does not need the database package. Keeping them separate allows each service to declare only the dependencies it actually needs, and allows you to reason about them independently.

---

### 2.7 The `infra/` Directory

Infrastructure configuration that is not Kubernetes lives here. This includes Dockerfiles, database initialisation scripts, and the RabbitMQ topology definition.

```
infra/
│
├── docker/
│   ├── api-gateway.Dockerfile
│   ├── auth-service.Dockerfile
│   ├── transfer-service.Dockerfile
│   └── ...                           # One per service
│
├── postgres/
│   ├── init/
│   │   └── 00_create_databases.sql   # Creates one DB per service
│   └── README.md
│
└── rabbitmq/
    ├── definitions.json              # Exchange, queue, binding declarations
    └── rabbitmq.conf                 # RabbitMQ server configuration
```

The `infra/docker/` directory contains production Dockerfiles. These are distinct from any dev-convenience setups. A production Dockerfile uses a multi-stage build: first stage compiles TypeScript and produces JavaScript output; second stage is a minimal Node.js runtime image that only contains the compiled output and production dependencies. This keeps production images small and free of build tools.

The `infra/postgres/init/` script creates all the separate databases at startup time for local development. In production, each database would be a separate managed instance, but for local development a single PostgreSQL server with multiple databases is practical.

---

### 2.8 The `k8s/` Directory

Kubernetes configuration is managed using **Kustomize**, which is built into `kubectl`. Kustomize allows you to have a set of base manifests and then apply environment-specific overlays on top of them without duplicating YAML.

```
k8s/
│
├── base/
│   ├── namespace.yaml
│   ├── api-gateway/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   ├── auth-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   ├── transfer-service/
│   │   └── ...
│   ├── infrastructure/
│   │   ├── postgres.yaml
│   │   ├── redis.yaml
│   │   └── rabbitmq.yaml
│   └── kustomization.yaml            # Root base kustomization
│
└── overlays/
    ├── local/
    │   ├── kustomization.yaml        # Patches for local: reduced replicas, etc.
    │   └── patches/
    │       └── resource-limits.yaml  # Lower CPU/memory for laptop
    ├── staging/
    │   ├── kustomization.yaml
    │   └── patches/
    └── production/
        ├── kustomization.yaml
        └── patches/
            ├── replicas.yaml         # Production replica counts
            └── resource-limits.yaml  # Production resource limits
```

The `base/` manifests define what the resources look like in their default form. The `overlays/` modify those defaults for each environment. For example, in production the Transfer Service might run with three replicas. In local development, it runs with one. The overlay patches the replica count without duplicating the entire deployment manifest.

---

### 2.9 The `docs/` Directory

Documentation is not an afterthought in this system. It is a first-class engineering artifact.

```
docs/
│
├── architecture/
│   ├── adr/                          # Architecture Decision Records
│   │   ├── 001-monorepo-structure.md
│   │   ├── 002-database-per-service.md
│   │   ├── 003-double-entry-ledger.md
│   │   └── 004-saga-pattern-for-transfers.md
│   └── diagrams/
│       ├── system-context.md         # C4 Level 1 diagram
│       ├── container.md              # C4 Level 2 diagram
│       └── transfer-flow.md          # Sequence diagram for transfers
│
├── api/
│   ├── openapi.yaml                  # OpenAPI 3.0 specification
│   └── postman/                      # Postman collection exports
│
└── runbooks/
    ├── transfer-failure.md           # What to do when transfers fail
    ├── dead-letter-queue.md          # How to reprocess DLQ messages
    └── database-migration.md         # Safe migration procedures
```

**Architecture Decision Records (ADRs)** deserve special mention. An ADR is a short document that records a significant architectural decision: what the decision was, the context that prompted it, the options considered, and the rationale for the chosen option. They are written in the past tense ("We decided to...") and are immutable — once written, they are not edited. If a decision is reversed, a new ADR is written documenting the reversal.

ADRs are invaluable. Six months from now, when you return to this codebase and wonder "why on earth did I choose X?", the ADR tells you. They also demonstrate architectural thinking to anyone reviewing your project.

---

### 2.10 Root Configuration Files

#### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'services/*'
  - 'packages/*'
```

This single file tells pnpm that every directory inside `apps/`, `services/`, and `packages/` is a workspace package.

#### `tsconfig.base.json`

The root TypeScript configuration that all services and packages extend. It establishes consistent compiler settings across the entire codebase.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "."
  },
  "exclude": ["node_modules", "dist"]
}
```

Each service's `tsconfig.json` extends this base and adds only what is specific to that service:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/shared-errors" }
  ]
}
```

The `references` field enables TypeScript's **project references** feature, which allows incremental compilation — TypeScript only recompiles a package when it changes, rather than recompiling everything on every build. This makes builds significantly faster in a large monorepo.

#### `docker-compose.yml`

The root Docker Compose file runs all infrastructure dependencies for local development. It does **not** run the services themselves — you run services directly with Node.js for a faster development loop. Only external dependencies run in Docker.

```yaml
# Conceptual structure — not literal code
services:
  postgres:
    image: postgres:16-alpine
    ports: [5432:5432]
    environment:
      POSTGRES_USER: fintech
      POSTGRES_PASSWORD: fintech
    volumes:
      - ./infra/postgres/init:/docker-entrypoint-initdb.d
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: [6379:6379]

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    ports:
      - 5672:5672    # AMQP protocol port
      - 15672:15672  # Management UI
    volumes:
      - ./infra/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json

  prometheus:
    image: prom/prometheus:latest
    ports: [9090:9090]
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports: [3001:3000]

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - 16686:16686  # Jaeger UI
      - 4318:4318    # OpenTelemetry HTTP collector

volumes:
  postgres_data:
```

#### Root `package.json`

The root `package.json` defines workspace-level scripts that operate on all packages. These are run with `pnpm` and use the `--filter` flag or `--recursive` flag to target specific packages.

```json
{
  "name": "fintech-platform",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter './services/*' --parallel dev",
    "build": "pnpm --recursive build",
    "test": "pnpm --recursive test",
    "test:unit": "pnpm --recursive test:unit",
    "lint": "pnpm --recursive lint",
    "typecheck": "pnpm --recursive typecheck",
    "infra:up": "docker-compose up -d",
    "infra:down": "docker-compose down",
    "db:migrate": "pnpm run -r db:migrate",
    "db:seed": "pnpm run -r db:seed"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

---

### 2.11 The Local Development Workflow

Understanding how you actually work day-to-day in this monorepo is important. Here is the full local development workflow from a cold start.

**Step 1: Start infrastructure**

```
pnpm infra:up
```

This starts PostgreSQL, Redis, RabbitMQ, Prometheus, Grafana, and Jaeger in Docker containers. Your services connect to these.

**Step 2: Run database migrations**

Each service has its own migration files in its `db/migrations/` directory. A migration is a SQL file that creates or modifies tables. Migrations are numbered sequentially and run in order. Once a migration has been applied to a database, it is never modified — if you need to change something, you write a new migration.

```
pnpm db:migrate
```

This runs the migration scripts for every service against their respective databases.

**Step 3: Start services**

You would typically start only the services you are working on. Starting all thirteen simultaneously on a laptop is resource-intensive.

```
pnpm --filter @fintech/transfer-service dev
pnpm --filter @fintech/ledger-service dev
pnpm --filter @fintech/account-service dev
```

Each service starts with `ts-node-dev` or `tsx --watch`, which compiles TypeScript and restarts the process on file changes.

**Step 4: Verify connectivity**

Each service exposes a `/health` endpoint that returns the service's name, version, and the status of its dependencies (database connection, message broker connection). Hitting this endpoint confirms the service started correctly.

---

### 2.12 Environment Variable Management

Environment variables are how services receive their configuration: database credentials, port numbers, JWT secrets, service URLs. Handling these well is important for security and operational clarity.

Each service has a `.env.example` file at its root. This file contains all the environment variables the service needs, with placeholder values. It is committed to the repository. The actual `.env` file — containing real secrets — is **never committed**. It is created locally by copying `.env.example` and filling in real values.

The `shared-config` package provides a typed, validated configuration object for each service. It uses **Zod** (a TypeScript schema validation library) to parse environment variables at startup. If a required variable is missing or has the wrong format, the service refuses to start and prints a clear error message. This is far better than services starting and mysteriously failing later when they first try to use a missing config value.

A service's config module looks like this conceptually:

```typescript
// Concept — not literal code
const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3004),
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  LEDGER_SERVICE_URL: z.string().url(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }
  return result.data;
}
```

This pattern means that by the time any service logic runs, all configuration is guaranteed to be present and correctly typed.

---

### 2.13 Naming Conventions

Consistency in naming reduces cognitive load. The following conventions apply throughout this project.

**File naming:** `kebab-case` for all files. `transfer.service.ts`, `account.repository.ts`, `shared-types`.

**TypeScript types and interfaces:** `PascalCase`. `TransferRequest`, `LedgerEntry`, `AccountStatus`.

**TypeScript functions and variables:** `camelCase`. `createTransfer`, `ledgerEntryId`, `accountBalance`.

**Database tables:** `snake_case` plurals. `transfers`, `ledger_entries`, `account_balances`.

**Database columns:** `snake_case`. `created_at`, `account_id`, `idempotency_key`.

**RabbitMQ exchanges:** `kebab-case` dot notation. `fintech.transfers`, `fintech.accounts`.

**RabbitMQ routing keys:** `dot.notation.lowercase`. `transfer.requested`, `account.frozen`.

**Environment variables:** `SCREAMING_SNAKE_CASE`. `DATABASE_URL`, `JWT_SECRET`, `RABBITMQ_URL`.

**Docker image names:** `kebab-case`. `fintech/transfer-service`, `fintech/ledger-service`.

**Kubernetes resource names:** `kebab-case`. `transfer-service-deployment`, `auth-service-svc`.

---

### 2.14 Git Strategy

This monorepo uses **trunk-based development** with short-lived feature branches. The main branch is always in a deployable state. Features are developed in branches named `feature/<description>`, bug fixes in `fix/<description>`, and infrastructure changes in `infra/<description>`.

Commit messages follow the **Conventional Commits** specification:

```
feat(transfer): add idempotency key validation
fix(ledger): correct balance calculation for frozen accounts
refactor(auth): extract token refresh logic into separate function
chore(k8s): update resource limits for production overlay
docs(adr): add decision record for saga pattern choice
test(transfer): add integration tests for concurrent transfer handling
```

The format is `type(scope): description`. The `scope` is the service or package affected. This convention enables automated changelog generation and makes the history readable.

---

### Key Concepts — Chapter 2

- A monorepo keeps all services, packages, and configuration in one repository, enabling atomic cross-service changes and shared tooling.
- pnpm workspaces manages the monorepo's packages, avoiding duplication and enabling direct local imports.
- Every service follows an identical layered internal structure: routes, controllers, services, repositories, events, validators.
- The layered architecture enforces the Dependency Rule: outer layers depend on inner layers, never the reverse.
- Shared packages (`@fintech/shared-types`, `@fintech/shared-events`, etc.) provide the glue between services.
- Configuration is validated at startup using Zod; a service will not start with missing or invalid config.
- Environment variables are documented in `.env.example` files; actual secrets are never committed.
- Architecture Decision Records document the reasoning behind significant design choices.

---

### Before You Continue — Chapter 2 Checklist

Before reading Chapter 3, make sure you can answer these:

1. Why is the `services/` directory separated from `apps/`?
2. What is the difference between a controller and a service layer in the layered architecture?
3. Why do shared packages exist as separate workspace packages rather than a single folder?
4. What is the purpose of a database migration file, and why can't you modify one after it has been applied?
5. What is an Architecture Decision Record and why should you write them?
6. Why does the Docker Compose file run infrastructure but not the services themselves?

---

## Chapter 3: Double-Entry Accounting — The Financial Core of the System

---

### 3.1 Why This Chapter Comes Before Any Service Design

Every architectural decision in this system — how the Ledger Service is structured, why the Transfer Service uses a Saga, why balances are never stored as a single column, why financial records are immutable — flows directly from one foundational concept: **double-entry accounting**.

If you misunderstand this chapter, you will misunderstand the entire system. Read it slowly. The concepts are not technically complex, but they require a shift in mental model if you have only ever built CRUD applications.

---

### 3.2 The Problem With the Simple Balance Approach

Imagine the naive implementation. You have a `users` table with a `balance` column.

```
users table:
| id  | name  | balance |
|-----|-------|---------|
| 1   | Alice | 5000    |
| 2   | Bob   | 2000    |
```

Alice sends ₹500 to Bob. You write two UPDATE statements:

```
UPDATE users SET balance = balance - 500 WHERE id = 1;
UPDATE users SET balance = balance + 500 WHERE id = 2;
```

This appears to work. In a tutorial, it does work. But it has profound problems in a production system.

**Problem 1: What if the second UPDATE never runs?**

The database crashes, or the network drops, after the first UPDATE succeeds but before the second runs. Alice's balance is now ₹500 less. Bob's balance is unchanged. ₹500 has vanished from the system. The total money in the system has decreased. This is called **money destruction** and it is catastrophic.

You might say: "wrap them in a transaction." That solves the single-database case. But in a microservices system, Alice's account and Bob's account might be in different databases, managed by different service instances. You cannot wrap operations across two separate databases in a single database transaction. This is the fundamental challenge of distributed systems — and it is why you need a more robust model.

**Problem 2: You lose all history.**

After the transfer, Alice's balance shows ₹4500. But can you answer: "What was Alice's balance at 2pm yesterday?" No. The balance column only holds the current value. Every previous value is overwritten and gone.

In a regulated financial system, this is unacceptable. Auditors, regulators, and your own fraud detection need the complete history of every financial movement. A single balance column cannot provide this.

**Problem 3: Concurrent updates corrupt data.**

Imagine two transfers involving Alice happen simultaneously. Transfer A reads Alice's balance as 5000 and plans to debit 500. Transfer B reads Alice's balance as 5000 and plans to debit 3000. Transfer A writes 4500. Transfer B writes 2000. The correct final balance should be 1500 (5000 - 500 - 3000), but instead it is 2000. Transfer A's debit was silently lost. Alice has been credited ₹500 she should not have.

This is the **lost update problem**, a classic race condition. You can partially address it with database row locks, but you cannot fully address it with a simple balance column in a distributed system.

**Problem 4: There is no audit trail.**

Who initiated the transfer? When exactly did it happen? Was it part of a batch operation or a manual action? Was it approved? A balance column records none of this. You are flying blind.

Double-entry accounting solves all four of these problems.

---

### 3.3 The Origin of Double-Entry Accounting

Double-entry accounting was formalised by Luca Pacioli, an Italian mathematician, in 1494. It has been the foundation of all financial record-keeping for over five hundred years. Every bank, every accounting system, every payment processor in the world uses it. It is not a software pattern — it is a mathematical truth about how to record financial movements without losing information or introducing inconsistency.

The core principle is elegantly simple:

**Every financial transaction must be recorded as at least two entries: one debit and one credit, and the total value of debits must always equal the total value of credits.**

That is the complete rule. Everything else follows from it.

---

### 3.4 Accounts, Debits, and Credits

To understand double-entry accounting, you must first understand how it uses the word "account" differently from how a banking customer uses it.

In double-entry accounting, an **account** is a named container for tracking a specific category of value. It is not necessarily a bank account you can send money to. Examples of accounts in double-entry accounting include:

- Alice's Wallet (an asset account — it represents money Alice owns)
- Bob's Wallet (another asset account)
- System Fees Earned (a revenue account — money the platform has earned)
- Pending Transfers (a liability account — money that is in transit)
- Suspense Account (a clearing account — temporary holding during processing)

Every entry in your ledger belongs to one of these accounts.

Now, the most counterintuitive part: **debits and credits do not mean "decrease" and "increase."** This is the mistake that confuses most software engineers when first encountering double-entry accounting.

The meaning of debit and credit depends on the **type** of account:

| Account Type | Debit Effect | Credit Effect |
|---|---|---|
| Asset (things you own) | Increases balance | Decreases balance |
| Liability (things you owe) | Decreases balance | Increases balance |
| Revenue (money earned) | Decreases balance | Increases balance |
| Expense (money spent) | Increases balance | Decreases balance |

For a fintech platform, you are primarily dealing with **asset accounts** (customer wallets) and **liability accounts** (pending/in-transit funds). So for the purposes of this system, the most important rules are:

- **Debit an asset account** → the account's balance goes up (the owner has more money)
- **Credit an asset account** → the account's balance goes down (the owner has less money)

Wait — that is backwards from what you would expect. In everyday language, "credit" means money coming in. But in double-entry accounting, crediting Alice's asset account means her balance *decreases*.

This seems confusing, but the reason becomes clear when you think about it from the bank's perspective. When you deposit money at a bank, the bank is in debt to you — your deposit is a *liability* for the bank. When the bank "credits your account," they are increasing their liability to you, which is the correct direction for a liability account.

For this project, you do not need to be a professional accountant. You need to understand one concrete mental model:

**Think of it as a flow of value.** Every transaction has a source (where value comes from) and a destination (where value goes to). The source account is **credited** (it gives away value). The destination account is **debited** (it receives value).

When Alice sends ₹500 to Bob:

- Alice's account is the **source** → it is **credited** (she gives away ₹500, her balance decreases)
- Bob's account is the **destination** → it is **debited** (he receives ₹500, his balance increases)

The total credits (₹500) equal the total debits (₹500). The books balance.

---

### 3.5 The Fundamental Rule: The Accounting Equation

The reason double-entry accounting works — the reason it has survived five hundred years — is that it enforces one mathematical invariant at all times:

```
Total Debits = Total Credits
```

Or equivalently:

```
Assets = Liabilities + Equity
```

In your system, this means: at any point in time, if you sum every debit entry in the entire ledger and every credit entry in the entire ledger, they must be equal. If they are not equal, something went wrong — money was created or destroyed, which means there is a bug or a fraud.

This is your system's most powerful self-consistency check. You can run this query at any time and if the result is not zero (total debits minus total credits), you have an incident.

---

### 3.6 The Ledger: A Record of Everything That Ever Happened

The **ledger** is the append-only record of every financial event. It is the single source of truth for all financial state. Every line in the ledger is a **ledger entry** (sometimes called a **journal entry**).

A ledger entry has the following structure:

| Field | Description |
|---|---|
| `id` | Unique identifier for this entry |
| `transaction_id` | Groups entries that belong to the same financial event |
| `account_id` | Which account this entry affects |
| `entry_type` | Either DEBIT or CREDIT |
| `amount` | The amount in paise (always positive) |
| `currency` | INR in this system |
| `created_at` | Immutable timestamp |
| `description` | Human-readable description |
| `metadata` | Additional context (transfer ID, reference number, etc.) |

The critical property: **ledger entries are never modified or deleted.** They are immutable. If a mistake is made, a correction is made by writing new, offsetting entries — not by changing the original.

---

### 3.7 Transactions: The Unit of Financial Work

In accounting, a **transaction** (not to be confused with a database transaction) is a complete financial event — something that happened in the real world that needs to be recorded. A transaction always consists of two or more ledger entries, and those entries must balance: total debits equal total credits.

The `transaction_id` field on each ledger entry is what links the entries of a single financial event together. When you want to understand what happened during a specific event, you fetch all ledger entries with that `transaction_id`.

---

### 3.8 The Complete Example: Alice Sends ₹500 to Bob

This is the most important example in the entire handbook. Work through it carefully.

**Setup:** Alice has a wallet account. Bob has a wallet account. Both are asset accounts in our system.

**The Event:** Alice sends ₹500 (50,000 paise) to Bob.

**Step 1: The system creates an accounting transaction.**

A transaction record is created with a unique ID. Let us call it `txn_abc123`. It has a description ("Transfer from Alice to Bob") and is initially in `PENDING` status.

**Step 2: The system creates two ledger entries linked to that transaction.**

```
Ledger Entry 1:
  transaction_id : txn_abc123
  account_id     : alice_wallet
  entry_type     : CREDIT
  amount         : 50000  (₹500 in paise)
  description    : "Debit for transfer to Bob"

Ledger Entry 2:
  transaction_id : txn_abc123
  account_id     : bob_wallet
  entry_type     : DEBIT
  amount         : 50000  (₹500 in paise)
  description    : "Credit for transfer from Alice"
```

**Step 3: Verify the entries balance.**

Total debits: 50,000 (Bob's entry)
Total credits: 50,000 (Alice's entry)
Difference: 0 ✓

The books balance. No money was created or destroyed.

**Step 4: Calculate balances.**

Alice's balance = sum of all DEBIT entries to alice_wallet − sum of all CREDIT entries to alice_wallet

If Alice started with ₹5,000 (500,000 paise), her previous state would have been:
- DEBIT of 500,000 (initial deposit)
- No credits yet

Her balance before this transfer: 500,000 − 0 = 500,000 paise = ₹5,000 ✓

After the transfer is recorded:
- DEBIT of 500,000 (initial deposit)
- CREDIT of 50,000 (this transfer)

Her balance after: 500,000 − 50,000 = 450,000 paise = ₹4,500 ✓

This is the key insight: **Alice's balance is never stored. It is always calculated by replaying her ledger entries.** The balance is a derived value, computed on demand.

---

### 3.9 A More Realistic Example: The Three-Account Transfer

In a real financial system, a transfer does not move money directly from Alice's account to Bob's account in a single atomic step. It passes through an intermediate account. This is essential for handling partial failures.

Your system uses a **Suspense Account** (also called a Transit Account or Clearing Account). This is a system-owned liability account that temporarily holds funds during a transfer.

Here is what actually happens when Alice sends ₹500 to Bob:

**Phase 1: Initiation — Alice's funds move into suspense**

```
Transaction: txn_phase1 (status: POSTED)

Entry 1:
  account_id  : alice_wallet
  entry_type  : CREDIT       ← Alice's asset account gives away value
  amount      : 50000

Entry 2:
  account_id  : suspense_account
  entry_type  : DEBIT        ← Suspense account receives value
  amount      : 50000
```

At this point, Alice's balance has decreased. The ₹500 is sitting in the suspense account. Bob has not yet received anything. This represents the state "money is in transit."

**Phase 2: Completion — Funds move from suspense to Bob**

```
Transaction: txn_phase2 (status: POSTED)

Entry 1:
  account_id  : suspense_account
  entry_type  : CREDIT       ← Suspense account releases value
  amount      : 50000

Entry 2:
  account_id  : bob_wallet
  entry_type  : DEBIT        ← Bob's asset account receives value
  amount      : 50000
```

Now the suspense account is back to zero (the debit from Phase 1 and the credit from Phase 2 cancel out), and Bob's balance has increased.

**Why does this matter?** Because now you have a clear record of where the money is at every moment. If Phase 2 fails (the system crashes between Phase 1 and Phase 2), you can look at the ledger and see: "The suspense account has a debit of ₹500 with no corresponding credit. Alice's money is sitting in suspense. We need to either complete Phase 2 or reverse Phase 1." The state is always visible and always consistent.

This three-account model is how every real payment system works. It is why your Transfer Service uses the Saga Pattern — it is orchestrating these multi-phase ledger operations with the ability to compensate if any phase fails.

---

### 3.10 Compensating Transactions: How You "Undo" an Entry

Remember: ledger entries are immutable. You cannot delete them. But what if a transfer fails after Phase 1 has been recorded? Alice's money is in the suspense account and needs to go back to Alice.

You write a **compensating transaction**. This is a new transaction that exactly reverses the effects of the original:

```
Transaction: txn_phase1_reversal (status: POSTED)
Description: "Reversal of txn_phase1 — transfer failed"

Entry 1:
  account_id  : suspense_account
  entry_type  : CREDIT       ← Reverse the debit to suspense
  amount      : 50000

Entry 2:
  account_id  : alice_wallet
  entry_type  : DEBIT        ← Reverse the credit to Alice
  amount      : 50000
```

After this, the suspense account is at zero (debit 50,000 and credit 50,000 cancel out), and Alice's wallet is back to its pre-transfer balance. The original entries still exist in the ledger — they are permanent evidence that a transfer was attempted and reversed. Nothing is hidden.

This is profoundly important: **the ledger is a complete narrative of everything that happened, including mistakes and corrections.** An auditor can look at the ledger and see the full story.

---

### 3.11 Calculating Balances Correctly

Since balances are never stored but always calculated, let us be precise about the calculation.

For an **asset account** (like a customer wallet):

```
Balance = (Sum of all DEBIT entries) − (Sum of all CREDIT entries)
```

A positive result means the account holds that much value. A negative result would be unusual and might indicate an overdraft situation, which your system should treat as a constraint violation.

For the system's suspense account (a liability account):

```
Balance = (Sum of all CREDIT entries) − (Sum of all DEBIT entries)
```

In practice, the suspense account should always have a balance very close to zero. Any non-zero balance means money is currently in transit (which is expected) or there is a reconciliation error (which needs investigation).

**Important performance consideration:** For accounts with many years of transaction history, recalculating the balance from the beginning of time on every request would be slow. The solution is **balance snapshots** — periodic materialised views that record the calculated balance at a specific point in time. To calculate the current balance, you load the most recent snapshot and sum only the entries since that snapshot. This gives you the correct current balance without scanning the entire ledger history. Balance snapshots are stored in a separate table and are recalculated periodically (for example, nightly), never modified once written.

---

### 3.12 The Chart of Accounts

In accounting, the **Chart of Accounts** is the master list of all accounts in the system. Every account has a unique identifier, a name, a type, and a purpose. For your platform, the chart of accounts includes:

**Customer Accounts (Asset type — one per customer wallet):**
Each customer who creates a wallet gets an entry in this chart. Their balance is always calculable from their ledger entries.

**System Accounts (managed by the platform):**

| Account Name | Type | Purpose |
|---|---|---|
| `SYS_SUSPENSE_TRANSFER` | Liability | Holds funds during in-flight transfers |
| `SYS_SUSPENSE_DEPOSIT` | Liability | Holds funds during deposit processing |
| `SYS_REVENUE_FEES` | Revenue | Records platform fee income |
| `SYS_EXPENSE_REFUNDS` | Expense | Records refunds paid out |

These system accounts are created when the platform is first deployed. They are permanent and never closed. Their balances reveal the financial health of the platform itself.

---

### 3.13 The Ledger Service's Responsibility

Given all of the above, you can now understand precisely what the Ledger Service must do:

1. **Accept transaction posting requests.** When the Transfer Service wants to move money, it does not write directly to the ledger. It sends a request to the Ledger Service: "Post a transaction with these entries." The Ledger Service validates that the entries balance, then writes them atomically.

2. **Enforce the balancing constraint.** The Ledger Service must reject any transaction where total debits do not equal total credits. This is a hard constraint, enforced at the database level as well as in application code.

3. **Enforce the non-negative balance constraint.** For asset accounts, the Ledger Service must reject any transaction that would push an account balance below zero (unless the account has been explicitly configured to allow overdraft, which is not supported in this version).

4. **Provide balance queries.** The Ledger Service is the only service that calculates and returns account balances. No other service should attempt to calculate a balance from raw ledger data.

5. **Provide ledger history queries.** Return a paginated list of ledger entries for a given account, optionally filtered by date range or transaction type.

6. **Emit events on state changes.** When a transaction is successfully posted, the Ledger Service publishes a `ledger.transaction.posted` event that other services (like the Notification Service) can consume.

7. **Maintain the audit trail.** Every write to the ledger is permanent and timestamped. The Ledger Service provides query capabilities for auditors to inspect any historical state.

---

### 3.14 What the Ledger Service Does NOT Do

Equally important is what the Ledger Service does not do, because these responsibilities belong elsewhere.

**It does not decide whether a transfer should happen.** That is the Transfer Service's job. The Ledger Service only records financial events. If the Transfer Service tells it to post a transaction, it validates the accounting rules (entries balance, sufficient funds) and posts it. Business rules like "transfers over ₹1,00,000 require approval" are enforced by the Transfer Service before the Ledger Service is ever called.

**It does not know about users.** The Ledger Service knows about accounts and entries. It does not know that account `acc_xyz` belongs to a user named Alice. Account ownership is the User Service and Account Service's concern.

**It does not send notifications.** It publishes events. The Notification Service consumes those events and sends the actual notifications.

**It does not enforce access control at the business level.** It trusts that the calling service (which comes through the API Gateway) has already verified that the requesting user has permission to initiate this transaction.

---

### 3.15 Reconciliation: Verifying the Books

**Reconciliation** is the process of verifying that the ledger is internally consistent — that the accounting equation holds, that every suspense account entry has a corresponding entry elsewhere, and that the total value in all customer accounts plus total value in transit equals the total value that has entered the system.

Your system should run automatic reconciliation checks on a schedule (for example, every hour and a comprehensive check every night). If any check fails, an alert is raised immediately. The Operations Service dashboard should show the reconciliation status.

The most important reconciliation check is:

```
Total debits across all entries = Total credits across all entries
```

If this check ever returns false, the system has a critical accounting error. Everything stops until it is investigated and resolved.

Secondary reconciliation checks include:

- The suspense account balance should match the sum of all in-flight transfers
- Every `PENDING` transaction should have a corresponding active transfer in the Transfer Service
- The sum of all customer wallet balances should equal the total deposits minus total withdrawals

These checks are your financial system's immune system — they detect corruption early, before it becomes a crisis.

---

### Key Concepts — Chapter 3

- Double-entry accounting records every financial event as at least two entries: one debit and one credit.
- Total debits must always equal total credits. This is the fundamental invariant of the system.
- For asset accounts (customer wallets): debits increase the balance, credits decrease it.
- Balances are never stored — they are always calculated by summing ledger entries.
- Ledger entries are immutable. Corrections are made by writing compensating transactions.
- Transfers flow through an intermediate suspense account, making in-transit funds visible and recoverable.
- The Chart of Accounts is the master list of all accounts in the system, including system-owned accounts.
- The Ledger Service is the single authority on balances and financial history.
- Reconciliation verifies the accounting equation holds across the entire ledger.

---

### Before You Continue — Chapter 3 Checklist

Before reading Chapter 4, make sure you can answer these:

1. Why is a simple `balance` column insufficient for a financial system?
2. In your own words, explain what a ledger entry is and what fields it contains.
3. Alice has an asset account. If you CREDIT her account, does her balance go up or down? Why?
4. Alice sends ₹200 to Bob. Write out the exact ledger entries created, including the suspense account phase.
5. A transfer fails after Phase 1. Write the compensating entries that restore Alice's balance.
6. Why are ledger entries immutable? What is the consequence of this for corrections?
7. How do you calculate an account's current balance efficiently when it has years of transaction history?

---

## Chapter 4: Event-Driven Architecture, RabbitMQ & Service Communication

---

### 4.1 The Communication Problem in Distributed Systems

When you broke your application into thirteen services, you created a new problem that did not exist in a monolith: **how do services talk to each other?**

In a monolith, communication is a function call. The transfer logic calls the notification logic directly. It is instantaneous, in-process, and if it fails, the failure is visible immediately in the same call stack. There is no network involved.

In a distributed system, services run in separate processes, often on separate machines. Communication crosses a network. Networks are unreliable. They introduce latency, packet loss, and timeouts. A service you are trying to reach may be temporarily down, overloaded, or in the middle of a deployment. Every cross-service call is a potential point of failure.

You have two fundamental choices for how services communicate. Understanding both — and understanding when to use each — is essential.

---

### 4.2 Synchronous Communication: Request-Response

The first option is **synchronous communication**, where one service sends a request to another and waits for a response. This is what HTTP gives you.

The Transfer Service needs to verify that Alice's account exists and is not frozen before initiating a transfer. It sends an HTTP GET request to the Account Service: "Does account `acc_abc` exist and is it active?" The Account Service responds immediately: "Yes, it is active." The Transfer Service receives the response and continues.

This is called **synchronous** because the caller blocks — it waits — until the response arrives. The interaction is like a phone call: both parties must be present simultaneously.

Synchronous communication is appropriate when:

- You need the answer before you can continue. You cannot decide whether to proceed with the transfer without knowing if the account is active.
- The operation is fast and the called service is reliable.
- You need to present an immediate result to the user (a balance check, for example).

The danger of synchronous communication is **cascading failures**. If Service B is slow, every service that calls Service B becomes slow too. If Service B is down, every service that requires Service B for a critical path is also effectively down. In a chain of five synchronous calls, any single service failing can take down the entire chain.

For this reason, synchronous communication in this system is restricted to operations that genuinely require an immediate answer: existence checks, balance reads, account status validation. Every other interaction — things that can happen asynchronously — uses a different approach.

---

### 4.3 Asynchronous Communication: Events

The second option is **asynchronous communication**, where one service announces that something happened and does not wait for anyone to respond. This is what events and message queues give you.

When a transfer is completed, the Transfer Service does not directly call the Notification Service and say "send Alice a message." Instead, it publishes an event: "A transfer has been completed. Here are the details." The Transfer Service then continues with its work. It does not wait. It does not care whether the Notification Service is currently running.

The Notification Service, whenever it is ready, picks up that event and sends the notification. If the Notification Service was down for five minutes, the event waited in the queue. When the service came back up, it processed the queued events. No notification was lost; it was just slightly delayed.

This is called **asynchronous** because the sender does not wait for the receiver. The interaction is like leaving a voicemail: the caller speaks their message and hangs up. The receiver listens to it at their own convenience.

Asynchronous communication is appropriate when:

- The operation can happen after the current request completes. Sending a notification does not need to happen before the transfer response is returned to Alice.
- The receiving service might be temporarily unavailable and you do not want that to affect the sender.
- Multiple services need to react to the same event. When a transfer completes, both the Notification Service and the Audit Service need to know. With direct HTTP calls, the Transfer Service would need to know about and call both services explicitly. With events, it publishes once and both services receive it independently.
- You want temporal decoupling — the sender and receiver do not need to be running at the same time.

---

### 4.4 The Message Broker: RabbitMQ

A **message broker** is an intermediary that receives messages from publishers and delivers them to consumers. It provides the queue that holds messages when consumers are not ready to process them.

**RabbitMQ** is your message broker. It is a mature, battle-tested system written in Erlang that implements the **AMQP** (Advanced Message Queuing Protocol) standard.

To understand RabbitMQ, you need to understand four concepts: **Messages**, **Exchanges**, **Queues**, and **Bindings**.

**A Message** is a packet of data with a body (your JSON payload) and headers (metadata like content type, timestamp, and routing information).

**An Exchange** is where publishers send messages. An exchange does not store messages — it routes them. When the Transfer Service publishes a `transfer.completed` event, it sends the message to the `fintech.transfers` exchange.

**A Queue** is where messages are stored until a consumer picks them up. Queues have persistence (messages survive RabbitMQ restarts) and acknowledgement (consumers confirm they processed a message before it is removed).

**A Binding** is a rule that connects an exchange to a queue. It says: "messages sent to this exchange with this routing key should be delivered to this queue." The Notification Service has a queue bound to the `fintech.transfers` exchange with routing key `transfer.completed`. Whenever a message matching that routing key arrives at the exchange, RabbitMQ delivers a copy to that queue.

The routing key is a dot-separated string that describes the event: `transfer.completed`, `account.frozen`, `ledger.transaction.posted`. Exchanges use these keys to route messages to the correct queues.

---

### 4.5 Exchange Types

RabbitMQ supports several exchange types. This system uses two.

**Topic Exchange** is the primary exchange type for this system. It routes messages based on pattern matching on the routing key. A binding pattern of `transfer.*` matches `transfer.completed` and `transfer.failed` but not `account.frozen`. A binding pattern of `transfer.#` matches `transfer.completed`, `transfer.failed`, and `transfer.completed.reversal` (the `#` wildcard matches zero or more words, the `*` wildcard matches exactly one word).

Topic exchanges give you flexible routing: a service can subscribe to a broad pattern (all transfer events) or a specific one (only completed transfers).

**Direct Exchange** routes messages to queues where the binding key exactly matches the routing key. Used for targeted communication where a specific queue must receive a specific message type.

For this system, you define one **topic exchange per domain**:

| Exchange Name | Domain | Example Routing Keys |
|---|---|---|
| `fintech.transfers` | Transfer events | `transfer.requested`, `transfer.completed` |
| `fintech.accounts` | Account events | `account.created`, `account.frozen` |
| `fintech.ledger` | Ledger events | `ledger.transaction.posted` |
| `fintech.deposits` | Deposit events | `deposit.completed` |
| `fintech.users` | User events | `user.created`, `user.verified` |
| `fintech.notifications` | Notification events | `notification.sent`, `notification.failed` |
| `fintech.audit` | Audit events | `audit.logged` |
| `fintech.scheduler` | Scheduler events | `schedule.executed`, `schedule.failed` |

---

### 4.6 Queues: One Per Consumer, Not One Per Event

A critical design decision: **each service that consumes events gets its own dedicated queue for those events.**

Imagine both the Notification Service and the Audit Service need to receive `transfer.completed` events. You do not create one shared queue that both services read from. If you did, RabbitMQ would round-robin messages between the two consumers, meaning each service only sees half the events.

Instead, you create two separate queues:

- `notification-service.transfer.completed` — bound to `fintech.transfers` with key `transfer.completed`
- `audit-service.transfer.completed` — bound to `fintech.transfers` with key `transfer.completed`

RabbitMQ delivers a copy of each message to both queues. Each service processes its own copy independently. This is called the **Publish-Subscribe** (Pub/Sub) pattern.

The naming convention `{consumer-service}.{routing-key}` makes it immediately clear which service owns which queue and what events it processes.

---

### 4.7 Message Acknowledgement and Delivery Guarantees

When a consumer receives a message from RabbitMQ, it must tell RabbitMQ whether it processed the message successfully. This is called **acknowledgement** (ack).

If a consumer successfully processes a message, it sends an **ack**. RabbitMQ removes the message from the queue.

If a consumer fails to process a message (an error occurs, or the service crashes), it sends a **nack** (negative acknowledgement) or simply does not ack. RabbitMQ requeues the message so another consumer instance can try again.

This mechanism gives you **at-least-once delivery**: RabbitMQ guarantees that every message will be delivered at least once. It might be delivered more than once if a consumer crashes after processing but before acking. This is why **idempotency** is so important — your consumers must be designed to safely handle receiving and processing the same message multiple times without producing incorrect results.

The acknowledgement flow in your system:

1. Consumer receives message from queue
2. Consumer begins processing
3. If processing succeeds: consumer acks → message removed from queue
4. If processing fails with a retriable error: consumer nacks with requeue → message goes back to queue
5. If processing fails with a permanent error: consumer nacks without requeue → message goes to Dead Letter Queue (explained in section 4.10)

---

### 4.8 Idempotency: Safe Duplicate Processing

**Idempotency** means that performing an operation multiple times produces the same result as performing it once. An idempotent operation is safe to retry.

Adding ₹500 to Bob's account is **not** idempotent. If this operation runs twice, Bob gets ₹1,000 instead of ₹500. You have a problem.

Marking a transfer as "completed" in your database **is** idempotent if you check first. If the transfer is already marked as completed, marking it as completed again is a no-op. The state does not change.

Every event consumer in your system must be idempotent. The mechanism is straightforward: every event has a unique `eventId`. When a consumer receives an event, it first checks if it has already processed an event with that ID. If yes, it acks and discards the message. If no, it processes the event and records the `eventId` as processed.

The record of processed event IDs lives in a table called `processed_events` in the consumer service's database:

```
processed_events table:
| event_id           | processed_at        | consumer_service     |
|--------------------|---------------------|----------------------|
| evt_abc123         | 2024-03-15 14:23:11 | notification-service |
| evt_def456         | 2024-03-15 14:23:14 | audit-service        |
```

When a message arrives, the consumer does a lookup against this table. If the `event_id` is already present, the message is a duplicate and is silently acked. If it is not present, the consumer processes the message and inserts the `event_id` into this table — ideally in the same database transaction as the processing work itself.

The insertion and the processing work happening in the same database transaction is important. If the processing succeeds but the `event_id` recording fails (or vice versa), you could end up either processing the same event twice or missing it entirely. Doing both in one atomic database transaction prevents this.

---

### 4.9 Event Envelope: The Standard Message Structure

Every message published to RabbitMQ follows a standard envelope format. This consistency means that all consumers can parse and validate messages using shared code from the `@fintech/shared-events` package.

```typescript
// Conceptual structure — illustrative only
interface EventEnvelope<T> {
  eventId: string;          // Unique ID for this event instance (UUID v4)
  eventType: string;        // e.g. "transfer.completed"
  eventVersion: string;     // e.g. "1.0" — for schema evolution
  producerService: string;  // e.g. "transfer-service"
  correlationId: string;    // Traces the original request across services
  causationId: string;      // The eventId that caused this event to be produced
  occurredAt: string;       // ISO 8601 timestamp
  payload: T;               // The actual event data, typed by T
}
```

**`eventId`** — Every event gets a universally unique identifier generated by the producer. This is the primary key for idempotency checks.

**`eventType`** — The routing key. Consumers use this to confirm they are processing the event type they expect.

**`eventVersion`** — As your system evolves, event schemas change. Versioning allows consumers to handle multiple versions of the same event type during transitions, rather than requiring all services to be updated simultaneously.

**`correlationId`** — This is how you trace a user's action across multiple services. When Alice initiates a transfer, the API Gateway assigns a `correlationId`. Every event published as a result of that transfer carries the same `correlationId`. When you look at logs or traces for that `correlationId`, you see the complete journey across all services. This is essential for debugging and observability.

**`causationId`** — If Service B publishes Event Y because it received Event X, the `causationId` of Event Y is the `eventId` of Event X. This lets you reconstruct the causal chain: "This notification was sent because this transfer was completed because this transfer request was received."

**`occurredAt`** — When the event occurred in the producing service. Not when it was received by the consumer.

---

### 4.10 Dead Letter Queues: Handling Poison Messages

A **Dead Letter Queue** (DLQ) is where messages go when they cannot be processed successfully after a configured number of retries.

Imagine a bug in the Notification Service's handler for `transfer.completed` events. Every time such a message arrives, the handler throws an error. The message is nacked, requeued, delivered again, fails again. This creates an infinite loop that keeps the queue congested and wastes resources.

RabbitMQ's dead-lettering mechanism solves this. Each queue is configured with a **retry count** and a **dead letter exchange**. When a message has been nacked a certain number of times (for example, three times), RabbitMQ routes it to the dead letter exchange instead of requeuing it. The dead letter exchange delivers it to a DLQ.

The DLQ is a separate queue that holds failed messages indefinitely, preserving them for investigation and manual reprocessing. Each main queue has a corresponding DLQ:

- `notification-service.transfer.completed` → DLQ: `notification-service.transfer.completed.dlq`
- `audit-service.transfer.completed` → DLQ: `audit-service.transfer.completed.dlq`

The Operations Service dashboard shows the current message count in every DLQ. A non-empty DLQ is an alert condition — it means some messages are failing to process and require attention. The Operations Service provides a tool to inspect DLQ messages and requeue them to the original queue once the underlying bug has been fixed.

**Poison messages** are a specific type of DLQ inhabitant: messages that are syntactically valid but will *always* fail processing due to invalid data. For example, a `transfer.completed` event that references an account ID that does not exist in the Notification Service's local data. These cannot be fixed by retrying — they require investigation and potentially manual data correction before reprocessing.

---

### 4.11 Retry Strategies with Exponential Backoff

Not all message processing failures are bugs. Some are transient: the database was momentarily unavailable, a downstream HTTP call timed out, a lock could not be acquired. These should be retried, but not immediately and not forever.

**Exponential backoff** means waiting progressively longer between retries:

- First retry: wait 1 second
- Second retry: wait 2 seconds
- Third retry: wait 4 seconds
- Fourth retry: wait 8 seconds
- After the Nth retry: send to DLQ

This strategy avoids hammering a struggling downstream service with a flood of immediate retries, which would make the situation worse.

In RabbitMQ, you implement retry delays using a **retry exchange with per-message TTL (Time To Live)**. When a message needs to be retried after a delay, you publish it to a special retry exchange with a TTL header. The message sits in a holding queue for the TTL duration, then is routed back to the original queue. This is sometimes called the **delayed retry pattern**.

**Jitter** — adding a small random variation to the retry delay — prevents the **thundering herd problem**: if many consumers fail simultaneously and all retry at exactly the same intervals, they all hammer the recovering service at the same moments. Jitter spreads the retries across a range of time, smoothing the load.

---

### 4.12 The Event Catalog Mindset

Before publishing any event, you must answer these questions. This is called **designing your event contract**.

**What does this event mean in business terms?** A `transfer.completed` event means a transfer of funds has been finalised and is irrevocable. It does not mean "the database write succeeded" — it means a real financial outcome has occurred.

**What is the minimal payload a consumer needs?** Events should carry enough information for consumers to act without making additional service calls. A `transfer.completed` event should include the transfer ID, source account ID, destination account ID, amount, currency, and timestamp. A consumer should not need to look up the transfer details from the Transfer Service to process this event — the event itself is self-contained.

**Who produces this event?** Exactly one service. Events have a single authoritative producer. Multiple services should never publish the same event type about the same domain entity.

**Who consumes this event?** List every service that needs to react to this event. Each consumer gets its own queue.

**What is the schema?** Define the exact JSON structure. Include all fields, their types, and whether they are optional. Once an event schema is published to production, it is versioned — you add fields (backwards-compatible) but never remove or rename them without incrementing the version.

**What is the idempotency strategy?** How will consumers detect and handle duplicate deliveries?

**What is the retry strategy?** How many retries before DLQ? What is the backoff curve?

---

### 4.13 The Complete Communication Map

Here is a map of how all services in this system communicate. This gives you a mental model of the full system before diving into individual services.

**Synchronous (HTTP) calls — used for:**

- API Gateway → any service (routing client requests)
- Transfer Service → Account Service (validate account status)
- Transfer Service → Ledger Service (post accounting transactions)
- Transfer Service → Approval Service (check approval requirements)
- Deposit Service → Ledger Service (post deposit transactions)
- Any service → Auth Service (validate tokens, only in gateway)

**Asynchronous (RabbitMQ) events — used for:**

- Transfer Service publishes → Notification Service, Audit Service, Reporting Service consume
- Account Service publishes → Notification Service, Audit Service consume
- Ledger Service publishes → Reporting Service, Audit Service consume
- Deposit Service publishes → Notification Service, Audit Service, Reporting Service consume
- Approval Service publishes → Transfer Service, Notification Service, Audit Service consume
- Scheduler Service publishes → Transfer Service consume (triggers scheduled transfers)
- Any service publishes audit events → Audit Service consumes

The pattern is consistent: **synchronous for queries and operations that block the current flow; asynchronous for notifications, side effects, and cross-service reactions.**

---

### 4.14 Service Discovery: How Services Find Each Other

When the Transfer Service needs to call the Account Service over HTTP, how does it know the Account Service's address? In a dynamic environment like Kubernetes, services may move between nodes, and their IP addresses change. You cannot hardcode addresses.

**Kubernetes Service** objects solve this. Every microservice in Kubernetes has a corresponding Service object that provides a stable DNS name. The Account Service, for example, has a Kubernetes Service named `account-service` in the `fintech` namespace. Any other service in the cluster can reach it at `http://account-service.fintech.svc.cluster.local:3003`.

This DNS name does not change, regardless of how many instances of the Account Service are running or where they are running. Kubernetes handles load balancing across instances transparently.

For local development (running services directly, not in Kubernetes), service URLs are configured via environment variables in each service's `.env` file: `ACCOUNT_SERVICE_URL=http://localhost:3003`.

---

### 4.15 Circuit Breakers: Protecting Against Cascading Failures

When the Transfer Service calls the Account Service and the Account Service is slow or unresponsive, the Transfer Service's request will hang until a timeout occurs. If many transfers are in flight simultaneously, many Transfer Service threads are blocked waiting for Account Service responses. The Transfer Service itself becomes slow and unresponsive, even though the problem originated in the Account Service. This is a **cascading failure**.

A **circuit breaker** prevents this. It works like an electrical circuit breaker: when it detects too many failures, it "opens" and stops sending requests to the failing service. Instead of waiting for a timeout, it fails fast with an immediate error. After a configured time, it allows a small number of "test" requests through to see if the service has recovered. If they succeed, it "closes" again. If they fail, it stays open.

For your system, implement circuit breakers on all synchronous service-to-service HTTP calls. The thresholds:

- Open after 5 consecutive failures or a 50% failure rate over 10 requests
- Wait 30 seconds before testing recovery (the "half-open" state)
- Close after 3 consecutive successful test requests

Libraries like `opossum` implement this pattern for Node.js. The circuit breaker state should be emitted as a metric to Prometheus — an open circuit breaker is an operational alert.

---

### 4.16 Correlation IDs: Tracing a Request Across Services

A user initiates a transfer. This creates:

1. An HTTP request to the API Gateway
2. An HTTP call from the API Gateway to the Transfer Service
3. An HTTP call from the Transfer Service to the Account Service
4. An HTTP call from the Transfer Service to the Ledger Service
5. A RabbitMQ event from the Transfer Service to the Notification Service queue
6. A RabbitMQ event from the Transfer Service to the Audit Service queue
7. An HTTP call from the Notification Service to an external email API

Seven separate operations across six services. If something goes wrong, how do you find the relevant logs?

The answer is the **Correlation ID**. When the API Gateway receives the original request, it generates a UUID and attaches it as a header: `X-Correlation-ID: uuid-abc123`. Every subsequent HTTP call made as a result of this request carries this same header. Every event published as a result of this request carries this same `correlationId` in the envelope.

Every log line emitted by every service, when processing work related to this request, includes the Correlation ID. When you search your centralised logging system for `correlationId: uuid-abc123`, you see every log line from every service that touched this request, in chronological order. The complete story.

The `correlationId` middleware in `@fintech/shared-middleware` handles this automatically: it reads the `X-Correlation-ID` header from incoming requests, stores it in the request context, and attaches it to all outgoing HTTP calls and event publications made during that request's processing.

---

### Key Concepts — Chapter 4

- Synchronous (HTTP) communication is used when the caller needs an immediate answer to continue.
- Asynchronous (event) communication is used for side effects, notifications, and reactions that do not block the current flow.
- RabbitMQ is the message broker; it routes messages from exchanges to queues based on routing keys.
- Each consumer service has its own dedicated queue — no shared queues between services.
- At-least-once delivery means consumers must be idempotent — they must handle duplicate events safely.
- Every event carries a standard envelope with eventId, correlationId, causationId, and payload.
- Dead Letter Queues hold messages that failed processing after all retries, for investigation and reprocessing.
- Exponential backoff with jitter prevents retry storms on transient failures.
- Circuit breakers prevent cascading failures by failing fast when downstream services are unhealthy.
- Correlation IDs trace a single user action across all services and all their logs.

---

### Before You Continue — Chapter 4 Checklist

Before reading Chapter 5, make sure you can answer these:

1. Give a concrete example from this system of a communication that should be synchronous and explain why.
2. Give a concrete example of a communication that should be asynchronous and explain why.
3. Why does each consumer service get its own queue rather than sharing one queue?
4. What is a Dead Letter Queue and when does a message end up there?
5. Explain idempotency in the context of message consumers. How do you implement it?
6. A transfer request arrives at the API Gateway. Describe the Correlation ID's journey through at least four services.
7. What is a circuit breaker and what problem does it solve?

---

## Chapter 5: Service Design — API Gateway & Auth Service

---

### 5.1 Why These Two Services Are Designed Together

The API Gateway and the Auth Service are deeply related. The API Gateway is the front door of your entire system — every request from every client passes through it. The Auth Service is the authority on identity — it knows who a user is and issues the credentials that prove it.

These two services are not the same thing, and conflating them is a common design mistake. The Auth Service manages the lifecycle of credentials: it creates accounts, verifies passwords, issues tokens, and refreshes them. The API Gateway uses those credentials to enforce access — it validates tokens and decides whether a request is allowed to proceed to a downstream service.

Keeping them separate means the Auth Service can be updated, scaled, and reasoned about independently of the routing and enforcement logic in the gateway.

---

### 5.2 The API Gateway

#### 5.2.1 Purpose

The API Gateway is the single entry point for all client traffic into the backend system. No client — whether the Next.js frontend, a mobile app, or an external partner — ever communicates directly with a downstream service. All traffic flows through the gateway.

This centralisation gives you one place to enforce cross-cutting concerns: authentication, rate limiting, request logging, correlation ID injection, and TLS termination. Without a gateway, every service would need to implement all of these independently, which leads to inconsistency and duplicated effort.

#### 5.2.2 Responsibilities

The API Gateway has a narrow, well-defined set of responsibilities. It is deliberately thin — it does not contain business logic.

**Authentication enforcement.** For every request to a protected route, the gateway validates the JWT access token. If the token is missing, expired, or invalid, the gateway returns `401 Unauthorized` immediately, without forwarding the request downstream.

**Routing.** The gateway maps incoming URL paths to downstream services. A request to `/api/v1/transfers` is proxied to the Transfer Service. A request to `/api/v1/accounts` is proxied to the Account Service.

**Correlation ID injection.** If an incoming request carries an `X-Correlation-ID` header, the gateway forwards it. If it does not, the gateway generates a new UUID and injects it. This ensures every request has a correlation ID before it reaches any downstream service.

**Rate limiting.** The gateway enforces per-user and per-IP rate limits using Redis as the counter store. If a client exceeds the limit, the gateway returns `429 Too Many Requests` without forwarding the request.

**Request and response logging.** Every request — method, path, status code, latency, correlation ID, authenticated user ID — is logged at the gateway level. This gives you a complete audit of all API traffic in one place.

**TLS termination.** In production, HTTPS is terminated at the gateway. Downstream services communicate over plain HTTP within the cluster's internal network, which is secured by Kubernetes network policies.

**Response transformation.** The gateway can modify responses from downstream services if needed — adding or removing headers, wrapping responses in a standard envelope.

#### 5.2.3 What the API Gateway Does NOT Do

The gateway does not authorise requests at the resource level. It validates "you are who you claim to be" (authentication). Whether "you are allowed to do this specific thing" (authorisation) is handled by each downstream service. The gateway passes the authenticated user's identity (user ID and role) as request headers to downstream services, which make their own authorisation decisions.

The gateway does not transform request bodies. It proxies them as-is to downstream services.

The gateway does not aggregate data from multiple services. If the frontend needs data from both the Account Service and the Ledger Service in a single response, the frontend makes two separate requests, or a dedicated BFF (Backend for Frontend) service handles the aggregation. The gateway does not fan out requests.

#### 5.2.4 API Endpoints

The API Gateway exposes one set of routes for authentication (which it handles itself by proxying to the Auth Service) and proxied routes for every other domain.

```
Authentication (proxied to Auth Service):
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password

Users (proxied to User Service):
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/:userId          [Admin, Support]

Accounts (proxied to Account Service):
GET    /api/v1/accounts
POST   /api/v1/accounts
GET    /api/v1/accounts/:accountId
DELETE /api/v1/accounts/:accountId
POST   /api/v1/accounts/:accountId/freeze    [Admin, Support]
POST   /api/v1/accounts/:accountId/unfreeze  [Admin]

Transfers (proxied to Transfer Service):
GET    /api/v1/transfers
POST   /api/v1/transfers
GET    /api/v1/transfers/:transferId

Ledger (proxied to Ledger Service):
GET    /api/v1/ledger/accounts/:accountId/entries
GET    /api/v1/ledger/accounts/:accountId/balance

Deposits (proxied to Deposit Service):
POST   /api/v1/deposits
GET    /api/v1/deposits/:depositId

Approvals (proxied to Approval Service):
GET    /api/v1/approvals
POST   /api/v1/approvals/:approvalId/approve  [Manager, Admin]
POST   /api/v1/approvals/:approvalId/reject   [Manager, Admin]

Reports (proxied to Reporting Service):
GET    /api/v1/reports/transactions           [Auditor, Admin]
GET    /api/v1/reports/account-summary        [Auditor, Admin]

Operations (proxied to Operations Service):
GET    /api/v1/ops/health
GET    /api/v1/ops/system-metrics             [Admin]
POST   /api/v1/ops/accounts/:accountId/credit [Admin]

Scheduler (proxied to Scheduler Service):
GET    /api/v1/schedules
POST   /api/v1/schedules
DELETE /api/v1/schedules/:scheduleId
```

#### 5.2.5 Routing Configuration

Rather than hardcoding routing logic in application code, the gateway uses a configuration-driven routing table. Each entry in the table declares a path pattern, the target service URL, which HTTP methods are allowed, and whether authentication is required.

```typescript
// Conceptual structure — illustrative only
interface RouteConfig {
  pathPattern: string;
  targetServiceUrl: string;
  methods: HttpMethod[];
  requiresAuth: boolean;
  allowedRoles?: Role[];
  rateLimit?: RateLimitConfig;
}
```

The routing table is loaded from the gateway's configuration at startup. Adding a new service means adding new entries to this table, not modifying gateway application code.

#### 5.2.6 The Proxy Mechanism

The gateway uses a reverse proxy library (such as `http-proxy-middleware` for Express) to forward requests to downstream services. The proxy:

1. Strips the `/api/v1` prefix (downstream services receive requests starting with their own paths)
2. Forwards all original request headers
3. Adds authentication headers: `X-User-ID`, `X-User-Role`, `X-Correlation-ID`
4. Forwards the request body unchanged
5. Returns the downstream service's response to the client

Downstream services trust these headers because they only accept traffic from within the cluster. An external client cannot inject a fake `X-User-ID` header because the gateway overwrites it.

#### 5.2.7 Database Schema

The API Gateway does not have its own PostgreSQL database. It is stateless. Rate limiting state is stored in Redis. Token validation uses the JWT signature verification (no database needed — the public key is in the gateway's configuration). This statelessness is important: it means you can run multiple gateway instances without any coordination between them.

#### 5.2.8 Folder Structure

```
services/api-gateway/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── index.ts              # Loads and validates env vars
│   ├── routes/
│   │   └── index.ts              # Mounts all route groups
│   ├── proxy/
│   │   ├── proxy.factory.ts      # Creates proxy middleware instances
│   │   └── routes.config.ts      # The routing table
│   ├── middleware/
│   │   ├── authenticate.ts       # JWT validation
│   │   ├── rateLimiter.ts        # Redis-backed rate limiting
│   │   ├── correlationId.ts      # Inject/forward correlation IDs
│   │   ├── requestLogger.ts      # Structured access log
│   │   └── errorHandler.ts       # Catch-all error formatter
│   └── utils/
│       └── jwt.utils.ts          # Token parsing utilities
├── tests/
│   ├── unit/
│   └── integration/
├── Dockerfile
└── package.json
```

#### 5.2.9 Security Concerns

**Token validation must be fast.** Every single request goes through token validation. Using asymmetric JWT (RS256) means the gateway holds only the Auth Service's **public key** — it can verify tokens without calling the Auth Service on each request. The public key is loaded once at startup from configuration.

**Rate limiting must be distributed.** If you run three gateway instances, each instance sees only one-third of the traffic. A per-instance in-memory counter would allow a client to exceed the limit by hitting different instances. Redis provides a shared counter that all gateway instances read from and write to atomically, giving you accurate rate limiting across the cluster.

**Never log request bodies by default.** Request bodies may contain passwords, PINs, or sensitive financial data. The access log logs metadata only: method, path, status code, latency, user ID, correlation ID. Body logging is opt-in and only enabled for debugging in non-production environments.

#### 5.2.10 Scaling Considerations

The gateway is the most aggressively scaled component in the system. It handles all traffic, so it must scale horizontally with demand. Because it is stateless, adding more instances is safe — a Kubernetes Horizontal Pod Autoscaler can add gateway instances automatically when CPU or request rate exceeds a threshold.

---

### 5.3 The Auth Service

#### 5.3.1 Purpose

The Auth Service is the identity authority for the entire platform. It owns the lifecycle of user credentials: registration, login, token issuance, token refresh, and logout. It knows who a user is. It does not know what they own or what they are allowed to do — those concerns belong to the User Service and the downstream service's authorisation logic respectively.

#### 5.3.2 Understanding JWT: The Token System

Before explaining the Auth Service's design, you need to understand **JSON Web Tokens (JWTs)** thoroughly, because they are the credential mechanism for every protected request in this system.

A JWT is a compact, self-contained token that encodes a set of **claims** — statements about the user. A claim might be: "this token belongs to user ID `usr_abc123`", or "this user has the role `customer`", or "this token expires at timestamp `1710512400`."

A JWT has three parts, separated by dots: `header.payload.signature`

The **header** declares the token type (JWT) and the signing algorithm used.

The **payload** contains the claims. The standard claims are:
- `sub` — the subject (user ID)
- `iat` — issued at (timestamp)
- `exp` — expiration timestamp
- `jti` — JWT ID (a unique identifier for this token instance)

Your system adds custom claims:
- `role` — the user's role (customer, admin, etc.)
- `sessionId` — links the token to a specific session

The **signature** is a cryptographic proof that the header and payload have not been tampered with since the token was issued. Your system uses **RS256** (RSA with SHA-256), an asymmetric algorithm. The Auth Service signs tokens with a **private key** that only it possesses. Any other service can verify the signature using the Auth Service's **public key**, which is distributed to all services at startup.

This asymmetry is critical: the gateway and downstream services can verify tokens without calling the Auth Service and without being able to issue new tokens. A service that can only verify signatures cannot forge tokens.

#### 5.3.3 Access Tokens and Refresh Tokens

A single-token system has a fundamental tension: short-lived tokens are secure (if stolen, they expire quickly) but annoying (users must log in frequently). Long-lived tokens are convenient but dangerous (a stolen token provides access for a long time).

The solution is a **two-token system**:

**Access Token** — a short-lived JWT (15 minutes). Used on every API request in the `Authorization: Bearer <token>` header. Because it expires quickly, a stolen access token has a small window of usefulness. It is stateless — the gateway validates it by checking the signature and expiry timestamp. No database lookup required.

**Refresh Token** — a long-lived opaque token (30 days). Stored securely in an `HttpOnly` cookie (not in JavaScript-accessible storage). Used only to obtain new access tokens when the current one expires. It is stateful — the Auth Service stores it in the database and can invalidate it by deleting the database record.

The flow:

1. User logs in. Auth Service issues an access token (in the response body) and a refresh token (in an HttpOnly cookie).
2. Frontend stores the access token in memory (not localStorage — avoid XSS exposure).
3. Every API request includes the access token as a Bearer header.
4. When the access token expires (after 15 minutes), the frontend detects a `401` response.
5. Frontend silently sends a request to `POST /api/v1/auth/refresh`, which includes the refresh token cookie automatically.
6. Auth Service validates the refresh token against the database, issues a new access token, and optionally rotates the refresh token.
7. Frontend retries the original request with the new access token.

**Refresh token rotation** means that every time a refresh token is used, it is invalidated and a new one is issued. If a stolen refresh token is used, the legitimate user's next refresh attempt will fail (because their token was rotated when the attacker used it), alerting them to the compromise.

#### 5.3.4 Session Management

Each login creates a **session record** in the Auth Service's database. The session record stores:

- The user ID
- The refresh token (hashed — never store tokens in plain text)
- The device information (user agent, approximate IP)
- Created and last-used timestamps
- An active/revoked flag

A user can have multiple active sessions simultaneously (logged in on their phone, their laptop, and their tablet). The Auth Service's `GET /api/v1/auth/sessions` endpoint lets a user see all their active sessions. `DELETE /api/v1/auth/sessions/:sessionId` revokes a specific session. `DELETE /api/v1/auth/sessions` revokes all sessions ("log out everywhere").

When a session is revoked, the refresh token for that session is deleted from the database. Any subsequent attempt to refresh using that token fails. However, the access tokens issued for that session remain valid until they expire naturally — this is the trade-off of stateless access tokens. To handle immediate access token invalidation (for example, after an admin freezes an account), the Auth Service maintains a **token blocklist** in Redis: a set of `jti` values (JWT IDs) that have been explicitly invalidated. The gateway checks this blocklist on every request.

#### 5.3.5 Password Handling

Passwords are never stored in plain text. They are hashed using **bcrypt** with a cost factor of 12. bcrypt is specifically designed for password hashing: it is deliberately slow (making brute-force attacks computationally expensive) and includes a random salt (preventing precomputed rainbow table attacks).

On registration: the provided password is hashed with bcrypt and only the hash is stored.
On login: the provided password is run through bcrypt's comparison function against the stored hash. bcrypt handles the salt automatically — you do not extract and compare salts manually.

Additional security measures:
- **Login rate limiting**: a maximum of 5 failed login attempts per IP per 15 minutes, enforced in Redis. After 5 failures, further attempts return `429` regardless of whether the credentials are correct. This prevents brute-force attacks.
- **Timing-safe comparison**: always use bcrypt's comparison function, never a simple string equality check. String equality in JavaScript short-circuits on the first mismatching character, which leaks information through timing differences (a **timing attack**). bcrypt's comparison always takes the same amount of time.

#### 5.3.6 Business Rules

- Email addresses must be unique. A registration attempt with a duplicate email returns `409 Conflict`.
- Email verification is required before the first login is permitted. On registration, the Auth Service publishes a `user.registered` event. The Notification Service sends a verification email. The user clicks the link, which calls `POST /api/v1/auth/verify-email` with the token. The Auth Service marks the email as verified and allows login.
- Passwords must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one digit, and one special character.
- A user whose account is suspended cannot log in (their login attempt returns `403 Forbidden` with a clear message).
- Password reset tokens expire after 1 hour and are single-use.

#### 5.3.7 API Endpoints

```
POST /api/v1/auth/register
  Body: { email, password, firstName, lastName }
  Response 201: { message: "Registration successful. Please verify your email." }
  Response 409: { error: "EMAIL_ALREADY_EXISTS" }

POST /api/v1/auth/verify-email
  Body: { token }
  Response 200: { message: "Email verified successfully." }
  Response 400: { error: "INVALID_OR_EXPIRED_TOKEN" }

POST /api/v1/auth/login
  Body: { email, password }
  Response 200: { accessToken, user: { id, email, role } }
           Sets HttpOnly cookie: refreshToken
  Response 401: { error: "INVALID_CREDENTIALS" }
  Response 403: { error: "EMAIL_NOT_VERIFIED" | "ACCOUNT_SUSPENDED" }
  Response 429: { error: "TOO_MANY_ATTEMPTS", retryAfter: 900 }

POST /api/v1/auth/logout
  Headers: Authorization: Bearer <accessToken>
  Response 200: { message: "Logged out successfully." }
           Clears HttpOnly cookie

POST /api/v1/auth/refresh
  Cookie: refreshToken (HttpOnly)
  Response 200: { accessToken }
           Rotates refresh token cookie
  Response 401: { error: "INVALID_OR_EXPIRED_REFRESH_TOKEN" }

POST /api/v1/auth/forgot-password
  Body: { email }
  Response 200: { message: "If that email exists, a reset link has been sent." }
  Note: Always returns 200 regardless of whether the email exists
        (prevents email enumeration)

POST /api/v1/auth/reset-password
  Body: { token, newPassword }
  Response 200: { message: "Password reset successfully." }
  Response 400: { error: "INVALID_OR_EXPIRED_TOKEN" }

GET /api/v1/auth/sessions
  Headers: Authorization: Bearer <accessToken>
  Response 200: { sessions: [{ id, device, createdAt, lastUsedAt }] }

DELETE /api/v1/auth/sessions/:sessionId
  Headers: Authorization: Bearer <accessToken>
  Response 200: { message: "Session revoked." }

DELETE /api/v1/auth/sessions
  Headers: Authorization: Bearer <accessToken>
  Response 200: { message: "All sessions revoked." }
```

#### 5.3.8 Database Schema

The Auth Service has its own dedicated PostgreSQL database named `auth_db`.

```
Table: users
Purpose: Stores login credentials. Note: this is separate from the User Service's
         profile data. The Auth Service knows only what it needs for authentication.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  email           VARCHAR(255) NOT NULL UNIQUE
  password_hash   VARCHAR(255) NOT NULL
  role            VARCHAR(50) NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer','support_agent','auditor','manager','admin'))
  is_email_verified  BOOLEAN NOT NULL DEFAULT false
  is_suspended    BOOLEAN NOT NULL DEFAULT false
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0
  last_failed_login      TIMESTAMPTZ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  deleted_at      TIMESTAMPTZ  -- soft delete

Indexes:
  UNIQUE INDEX on email (for fast login lookup)
  INDEX on role (for admin queries filtering by role)
  INDEX on deleted_at (for filtering soft-deleted records)

Constraints:
  email must match email format (CHECK constraint with regex)
  role must be one of the defined values
```

```
Table: sessions
Purpose: Tracks active refresh token sessions for each user.

Columns:
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  refresh_token_hash  VARCHAR(255) NOT NULL UNIQUE
  user_agent          TEXT
  ip_address          INET
  is_revoked          BOOLEAN NOT NULL DEFAULT false
  expires_at          TIMESTAMPTZ NOT NULL
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on user_id (for "show all sessions for user" queries)
  UNIQUE INDEX on refresh_token_hash (for token lookup during refresh)
  INDEX on expires_at (for cleaning up expired sessions)
  INDEX on is_revoked (for filtering active sessions)
```

```
Table: email_verification_tokens
Purpose: Temporary tokens for email verification.

Columns:
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  token_hash  VARCHAR(255) NOT NULL UNIQUE
  expires_at  TIMESTAMPTZ NOT NULL
  used_at     TIMESTAMPTZ  -- NULL if not yet used
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  UNIQUE INDEX on token_hash (for fast lookup)
  INDEX on user_id
  INDEX on expires_at (for cleanup)
```

```
Table: password_reset_tokens
Purpose: Temporary tokens for password reset flow.

Columns:
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
  token_hash  VARCHAR(255) NOT NULL UNIQUE
  expires_at  TIMESTAMPTZ NOT NULL
  used_at     TIMESTAMPTZ
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  UNIQUE INDEX on token_hash
  INDEX on expires_at (for cleanup job)
```

#### 5.3.9 Events Published

```typescript
// user.registered — published on successful registration
{
  eventType: "user.registered",
  payload: {
    userId: string,
    email: string,
    role: string,
    verificationToken: string,  // for the email link
    occurredAt: string
  }
}

// user.email_verified — published when email is confirmed
{
  eventType: "user.email_verified",
  payload: {
    userId: string,
    email: string,
    occurredAt: string
  }
}

// user.logged_in — published on successful login
{
  eventType: "user.logged_in",
  payload: {
    userId: string,
    sessionId: string,
    ipAddress: string,
    userAgent: string,
    occurredAt: string
  }
}

// user.password_reset_requested
{
  eventType: "user.password_reset_requested",
  payload: {
    userId: string,
    email: string,
    resetToken: string,
    occurredAt: string
  }
}

// user.password_changed
{
  eventType: "user.password_changed",
  payload: {
    userId: string,
    occurredAt: string
  }
}

// user.session_revoked
{
  eventType: "user.session_revoked",
  payload: {
    userId: string,
    sessionId: string,
    revokedAll: boolean,
    occurredAt: string
  }
}

// user.suspended — published when an admin suspends an account
{
  eventType: "user.suspended",
  payload: {
    userId: string,
    reason: string,
    suspendedBy: string,  // admin user ID
    occurredAt: string
  }
}
```

#### 5.3.10 Events Consumed

```
operations.user_suspended → the Auth Service receives this from the Operations
Service when an admin suspends a user, and sets is_suspended = true in the
users table, also adding the user's active access token JTIs to the Redis
blocklist to invalidate them immediately.
```

#### 5.3.11 Failure Scenarios

**The Auth Service is down when a user tries to log in.** The API Gateway cannot proxy the login request. The user sees a `503 Service Unavailable`. No financial data is at risk. Recovery: Kubernetes restarts the Auth Service pod if it crashes. Login will succeed once the service recovers.

**The database is slow during a login attempt.** The password hash comparison (bcrypt) is CPU-bound and happens before the database write for session creation. If the database is slow, the session creation may time out. The recommended approach: return a `503` with a `Retry-After` header. Do not create partial sessions.

**A refresh token is stolen and used before the legitimate user's next refresh.** The attacker uses the stolen token to obtain new access and refresh tokens. When the legitimate user next tries to refresh (their token has now been rotated by the attacker's use), the Auth Service detects the reuse of an already-rotated token. This is a signal of token theft. The Auth Service immediately revokes all sessions for that user and publishes a `user.all_sessions_revoked` event. The user is forced to log in again.

**Redis is unavailable for the token blocklist check.** This is a critical failure path. If the blocklist cannot be checked, a suspended user's access token cannot be verified as invalid. The recommended approach: **fail closed** — if Redis is unavailable, reject the request with `503` rather than allowing potentially invalid tokens through. This is a security decision: availability is sacrificed to preserve security.

#### 5.3.12 TypeScript Types

```typescript
// Illustrative interface designs — not implementation code

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  isSuspended: boolean;
  createdAt: Date;
}

type UserRole =
  | 'customer'
  | 'support_agent'
  | 'auditor'
  | 'manager'
  | 'admin';

interface JwtPayload {
  sub: string;        // userId
  role: UserRole;
  sessionId: string;
  jti: string;        // unique token ID, for blocklist
  iat: number;
  exp: number;
}

interface Session {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
```

#### 5.3.13 Folder Structure

```
services/auth-service/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── index.ts
│   ├── routes/
│   │   └── v1/
│   │       ├── auth.routes.ts
│   │       └── health.routes.ts
│   ├── controllers/
│   │   └── auth.controller.ts
│   ├── services/
│   │   ├── auth.service.ts          # Registration, login, logout
│   │   ├── token.service.ts         # JWT issuance and validation
│   │   ├── session.service.ts       # Session CRUD
│   │   └── password.service.ts      # Hashing, reset flow
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── session.repository.ts
│   │   └── token.repository.ts      # email verification + reset tokens
│   ├── events/
│   │   ├── publishers/
│   │   │   └── auth.publisher.ts
│   │   └── consumers/
│   │       └── operations.consumer.ts
│   ├── middleware/
│   │   └── auth.middleware.ts
│   ├── validators/
│   │   └── auth.validator.ts
│   └── types/
│       └── auth.types.ts
├── db/
│   └── migrations/
│       ├── 001_create_users.sql
│       ├── 002_create_sessions.sql
│       ├── 003_create_email_verification_tokens.sql
│       └── 004_create_password_reset_tokens.sql
├── tests/
│   ├── unit/
│   │   ├── token.service.test.ts
│   │   └── password.service.test.ts
│   └── integration/
│       └── auth.api.test.ts
├── Dockerfile
└── package.json
```

#### 5.3.14 Scaling Considerations

The Auth Service's most expensive operation is bcrypt hashing during login. bcrypt is intentionally CPU-intensive. Under high login load, this becomes the bottleneck. Horizontal scaling (multiple Auth Service instances) distributes this CPU load. Each instance is stateless with respect to JWT validation (no shared state needed). Session data is in the database (shared across instances). The Redis blocklist is shared across instances.

Do not reduce the bcrypt cost factor to improve performance. The cost factor is a security control. Instead, scale horizontally.

---

### 5.4 The RBAC Model: Roles and Permissions

The API Gateway and Auth Service together implement the **Role-Based Access Control (RBAC)** model for the platform. Since this model touches every service, it is designed here.

RBAC means that permissions are assigned to roles, and roles are assigned to users. You do not assign permissions directly to individual users. When a user's role changes, all their permissions change automatically.

#### The Roles

```
customer
  — The default role for every registered user.
  — Can view and manage their own accounts and transfers only.
  — Cannot see other users' data.
  — Cannot perform any administrative actions.

support_agent
  — Customer service staff.
  — Can view any customer's account information and transaction history.
  — Can freeze accounts (not unfreeze — that requires higher authority).
  — Cannot initiate transfers or credit accounts.

auditor
  — Compliance and audit staff.
  — Read-only access to all transaction data and audit logs.
  — Cannot modify anything.

manager
  — Operations managers.
  — Can approve or reject transfers that exceed the approval threshold.
  — Can approve sensitive administrative actions.
  — Cannot directly credit accounts or freeze accounts.

admin
  — System administrators.
  — Full access to all operations.
  — Can credit accounts, freeze and unfreeze accounts.
  — Can manage user roles.
  — All admin actions are logged with extra audit detail.
```

#### The Permissions Matrix

```
Action                          | Customer | Support | Auditor | Manager | Admin
--------------------------------|----------|---------|---------|---------|------
View own accounts               |    ✓     |         |         |         |  ✓
View any account                |          |    ✓    |    ✓    |         |  ✓
Initiate transfer               |    ✓     |         |         |         |  ✓
View own transfers              |    ✓     |         |         |         |  ✓
View all transfers              |          |    ✓    |    ✓    |         |  ✓
View all audit logs             |          |         |    ✓    |         |  ✓
Approve large transfers         |          |         |         |    ✓    |  ✓
Reject large transfers          |          |         |         |    ✓    |  ✓
Freeze account                  |          |    ✓    |         |         |  ✓
Unfreeze account                |          |         |         |         |  ✓
Credit account                  |          |         |         |         |  ✓
Manage user roles               |          |         |         |         |  ✓
View system health metrics      |          |         |         |    ✓    |  ✓
View reporting dashboards       |          |         |    ✓    |    ✓    |  ✓
```

#### How RBAC Is Enforced

The Auth Service embeds the user's role in the JWT access token. The gateway validates the token and extracts the role. For routes with role restrictions (marked in the routing table with `allowedRoles`), the gateway checks the role and returns `403 Forbidden` if it does not match.

For resource-level checks — "can this customer access this specific account?" — the downstream service performs the check. The gateway passes `X-User-ID` and `X-User-Role` headers to every downstream service. The Account Service, when it receives a `GET /accounts/:accountId` request, checks: "Does the account with this ID belong to the user with this ID? If not, and if the requesting user is not an admin or support agent, return 403."

This two-layer enforcement — role check at the gateway, resource ownership check in the service — provides both coarse-grained and fine-grained access control.

---

### Key Concepts — Chapter 5

- The API Gateway is the single entry point for all client traffic; it handles auth enforcement, routing, rate limiting, and correlation ID injection, but not business logic.
- The Auth Service is the identity authority; it manages credentials, sessions, and token issuance. It does not handle user profiles.
- JWTs use asymmetric signing (RS256): the Auth Service signs with a private key; all other services verify with the public key.
- Access tokens are short-lived (15 minutes) and stateless; refresh tokens are long-lived (30 days) and stateful.
- Refresh token rotation means a used refresh token is immediately invalidated; theft detection is built in.
- A Redis blocklist enables immediate access token invalidation without waiting for natural expiry.
- bcrypt with a cost factor of 12 is used for password hashing; never reduce this for performance.
- RBAC assigns permissions to roles and roles to users; enforcement is split between the gateway (role check) and services (resource ownership check).
- The gateway is stateless and scales horizontally without coordination.

---

### Before You Continue — Chapter 5 Checklist

Before reading Chapter 6, make sure you can answer these:

1. Why does the API Gateway validate JWTs itself rather than calling the Auth Service on every request?
2. What is the difference between authentication and authorisation, and where does each happen in this system?
3. Why are access tokens short-lived and refresh tokens long-lived? What does each protect against?
4. A user's account is suspended by an admin. Their access token still has 10 minutes before it expires. How does the system invalidate it immediately?
5. What happens when a stolen refresh token is used? Walk through the detection and response mechanism.
6. Why is bcrypt's cost factor a security control rather than a tunable performance parameter?
7. A support agent makes a request to view a customer's account. Trace the request through the gateway's RBAC check and then through the Account Service's ownership check.

---

## Chapter 6: Service Design — User Service, Account Service & Ledger Service

---

### 6.1 Three Services, One Conceptual Thread

These three services form the data foundation of the entire platform. Every other service depends on them in some way. Before a transfer can happen, there must be accounts. Before accounts can exist, there must be users. Before balances can be queried, there must be a ledger.

Understanding precisely where each service's responsibility begins and ends — and why the boundaries are drawn where they are — is as important as understanding what each service does.

A common mistake is to merge these three into one "accounts" service. Resist that impulse. The separations exist for reasons that become clear under load and under change. The User Service changes when product management wants to add profile fields. The Account Service changes when business rules around account types change. The Ledger Service almost never changes — it is the most stable component in the system because it is governed by accounting principles that have not changed in five hundred years. Merging them would mean that a change to a user's profile field triggers a redeployment of the system that handles all financial records.

---

## Part A: The User Service

### 6.2 Purpose

The User Service owns the **profile** of a user. It knows a user's name, contact details, preferences, and Know Your Customer (KYC) status. It does not know about the user's credentials (that is the Auth Service) and it does not know about the user's accounts or balances (that is the Account Service and Ledger Service).

When the Auth Service successfully registers a new user, it publishes a `user.registered` event. The User Service consumes this event and creates a profile record for the new user. This is an important pattern: the Auth Service does not call the User Service directly to create a profile. It publishes an event and the User Service reacts. This keeps the registration flow fast (the Auth Service returns its response immediately without waiting for profile creation) and keeps the services decoupled.

### 6.3 Responsibilities

The User Service is responsible for:

- Storing and serving user profile data (name, phone number, address)
- Tracking KYC (Know Your Customer) verification status
- Providing user lookup capabilities for authorised internal services
- Managing user preferences (notification settings, language, timezone)
- Maintaining a soft-deleted record of deactivated users for regulatory compliance

### 6.4 Know Your Customer (KYC)

KYC is a regulatory requirement in financial services. Before a user can perform certain high-value operations — sending large transfers, for example — the platform must verify their identity. This involves collecting government-issued ID information and verifying it against authoritative sources.

In this system, KYC is simplified to a status field with a defined progression:

```
KYC Status Progression:

PENDING → The user has registered but not submitted KYC documents.
          Limited operations allowed (small deposits, no transfers above ₹10,000).

SUBMITTED → The user has submitted their documents and is awaiting verification.
            Same limits as PENDING apply.

VERIFIED → KYC has been approved. Full platform capabilities are unlocked.

REJECTED → KYC was submitted but could not be verified.
           User must resubmit with corrected documents.

SUSPENDED → KYC was previously verified but has been suspended by compliance.
            All operations are frozen.
```

The KYC status is checked by the Transfer Service when validating whether a transfer is permitted. The Transfer Service calls the User Service's internal API to fetch the KYC status of the sending user before processing the transfer.

### 6.5 Business Rules

- A user profile is created automatically when the `user.registered` event is received. The user does not manually create their profile.
- Users can update their own profile fields (name, phone) but cannot change their email (email changes are a separate, verification-required flow owned by the Auth Service).
- A user can only view their own profile. Admins and Support Agents can view any profile.
- User profiles are never hard deleted. When a user closes their account, the profile is soft-deleted (the `deleted_at` field is set). The record is retained for seven years for regulatory compliance.
- KYC status can only be updated by the Operations Service (admin action). Users cannot update their own KYC status.

### 6.6 API Endpoints

```
GET  /api/v1/users/me
     Auth: Any authenticated user
     Response 200: { id, email, firstName, lastName, phone,
                     kycStatus, preferences, createdAt }

PATCH /api/v1/users/me
     Auth: Any authenticated user
     Body: { firstName?, lastName?, phone?, preferences? }
     Response 200: { updated user profile }
     Response 422: { error: "VALIDATION_ERROR", fields: [...] }

GET  /api/v1/users/:userId
     Auth: Support Agent, Auditor, Admin
     Response 200: { full user profile }
     Response 404: { error: "USER_NOT_FOUND" }

GET  /api/v1/users/internal/:userId
     Auth: Internal service-to-service only (no JWT — uses internal API key)
     Purpose: Called by Transfer Service to check KYC status
     Response 200: { id, kycStatus, isActive }
     Response 404: { error: "USER_NOT_FOUND" }

GET  /api/v1/users?search=<query>&role=<role>&kycStatus=<status>
     Auth: Admin, Support Agent
     Response 200: { users: [...], pagination: { page, limit, total } }
```

The `/internal/` prefix marks endpoints that are service-to-service only. These endpoints do not require a user JWT but instead require an internal API key header (`X-Internal-API-Key`). The API Gateway does not expose these routes to external clients. They are only accessible within the Kubernetes cluster. Internal API keys are stored as Kubernetes Secrets and injected as environment variables.

### 6.7 Database Schema

```
Database: user_db

Table: user_profiles
Purpose: Core profile data for each registered user.

Columns:
  id                UUID PRIMARY KEY
                    Note: This is the SAME UUID as the Auth Service's users.id.
                    Both services share the user ID generated by the Auth Service.
                    This is NOT a foreign key relationship (different databases)
                    but the values are coordinated via the user.registered event.
  email             VARCHAR(255) NOT NULL UNIQUE
                    Denormalised from Auth Service for display and search.
                    Kept in sync via user.email_changed events.
  first_name        VARCHAR(100) NOT NULL
  last_name         VARCHAR(100) NOT NULL
  phone_number      VARCHAR(20)
  date_of_birth     DATE
  address_line_1    VARCHAR(255)
  address_line_2    VARCHAR(255)
  city              VARCHAR(100)
  state             VARCHAR(100)
  postal_code       VARCHAR(20)
  country           CHAR(2) NOT NULL DEFAULT 'IN'
  kyc_status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (kyc_status IN
                    ('pending','submitted','verified','rejected','suspended'))
  kyc_verified_at   TIMESTAMPTZ
  kyc_verified_by   UUID           -- admin user ID who approved
  is_active         BOOLEAN NOT NULL DEFAULT true
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  deleted_at        TIMESTAMPTZ    -- soft delete

Indexes:
  UNIQUE INDEX on email
  INDEX on kyc_status
  INDEX on is_active
  INDEX on deleted_at
  INDEX on (last_name, first_name) for name search
  INDEX on created_at for date-range queries
```

```
Table: user_preferences
Purpose: Stores configurable user preferences separately from core profile
         data. Separating these allows the preferences schema to evolve
         independently without touching the main profile table.

Columns:
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id           UUID NOT NULL UNIQUE REFERENCES user_profiles(id)
  language          CHAR(2) NOT NULL DEFAULT 'en'
  timezone          VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata'
  email_notifications_enabled    BOOLEAN NOT NULL DEFAULT true
  sms_notifications_enabled      BOOLEAN NOT NULL DEFAULT true
  push_notifications_enabled     BOOLEAN NOT NULL DEFAULT true
  transfer_notification_threshold  BIGINT DEFAULT 0
                    -- only notify for transfers above this amount (in paise)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  UNIQUE INDEX on user_id
```

```
Table: kyc_submissions
Purpose: Records each KYC document submission attempt. Multiple attempts
         are possible if the first is rejected.

Columns:
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id               UUID NOT NULL REFERENCES user_profiles(id)
  document_type         VARCHAR(50) NOT NULL
                        CHECK (document_type IN
                        ('aadhaar','pan','passport','driving_licence'))
  document_number       VARCHAR(50) NOT NULL
  document_reference    VARCHAR(255)  -- reference from KYC verification provider
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected'))
  rejection_reason      TEXT
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  reviewed_at           TIMESTAMPTZ
  reviewed_by           UUID         -- admin user ID

Indexes:
  INDEX on user_id
  INDEX on status
  INDEX on submitted_at
```

### 6.8 Events Published

```typescript
// user.profile_updated
{
  eventType: "user.profile_updated",
  payload: {
    userId: string,
    updatedFields: string[],   // which fields changed, not the values
    occurredAt: string
  }
}

// user.kyc_status_changed
{
  eventType: "user.kyc_status_changed",
  payload: {
    userId: string,
    previousStatus: KycStatus,
    newStatus: KycStatus,
    changedBy: string,         // admin user ID
    occurredAt: string
  }
}
```

### 6.9 Events Consumed

```
user.registered (from Auth Service)
  → Creates a new user_profiles record and a user_preferences record
  → Idempotency: check if profile with this userId already exists before inserting

user.email_verified (from Auth Service)
  → No action needed in User Service currently. Logged for audit purposes.

operations.kyc_approved (from Operations Service)
  → Updates kyc_status to 'verified', sets kyc_verified_at and kyc_verified_by

operations.kyc_rejected (from Operations Service)
  → Updates kyc_status to 'rejected', stores rejection reason
```

### 6.10 Failure Scenarios

**The `user.registered` event is received but the database insert fails.** The consumer nacks the message and it is retried with backoff. After three retries it goes to the DLQ. The user exists in the Auth Service (they can log in) but has no profile. The Operations dashboard alerts on DLQ messages. An operator manually investigates and reprocesses the DLQ message once the underlying issue (likely a database connectivity problem) is resolved.

**The User Service is unreachable when the Transfer Service checks KYC status.** The Transfer Service's circuit breaker opens. The transfer is rejected with a `503` and the user is instructed to try again shortly. No financial operation proceeds without confirmed KYC status.

---

## Part B: The Account Service

### 6.11 Purpose

The Account Service owns the concept of a **financial account**. An account is a named container that can hold money and has an owner. One user can own multiple accounts (for example, a "Savings" wallet and a "Business" wallet).

The Account Service knows who owns an account, what type it is, what its status is, and what currency it operates in. It does not know the balance — that is calculated by the Ledger Service. It does not know the transaction history — that is stored in the Ledger Service. It is purely responsible for the account's identity, ownership, and status.

### 6.12 Responsibilities

- Creating accounts for verified users
- Enforcing account ownership (a user can only access their own accounts unless they have elevated privileges)
- Managing account status (active, frozen, closed)
- Providing account lookup for internal service-to-service calls
- Validating that an account is eligible to send or receive money before a transfer proceeds

### 6.13 Business Rules

- A user must have KYC status of `verified` to create an account. The Account Service calls the User Service's internal API to check this before creating an account.
- A user can hold a maximum of five active accounts simultaneously (configurable).
- Accounts can be in one of three statuses: `active`, `frozen`, or `closed`.
- A `frozen` account cannot send or receive money. Freezing is an administrative action performed by Support Agents or Admins.
- A `closed` account cannot perform any operations. Closing requires that the account balance be zero (you cannot close an account with funds in it).
- Account numbers are system-generated, unique, and follow a defined format: `ACC` followed by 12 digits. They are not sequential — they are generated to avoid enumeration attacks.
- Currency is set at account creation and cannot be changed. This system currently supports only INR.

### 6.14 Account Status State Machine

Understanding the valid transitions between states is important because the Account Service enforces them:

```
Valid State Transitions:

ACTIVE → FROZEN      (by Support Agent or Admin, for any reason)
ACTIVE → CLOSED      (by user, only if balance is zero)
FROZEN → ACTIVE      (by Admin only — unfreezing requires higher authority)
FROZEN → CLOSED      (by Admin only — even frozen accounts can be closed)
CLOSED → [nothing]   (closed is terminal — no transitions out)
```

Any attempt to transition to an invalid state returns `422 Unprocessable Entity` with an error code explaining why the transition is not permitted.

### 6.15 API Endpoints

```
GET  /api/v1/accounts
     Auth: Authenticated user
     Response 200: { accounts: [{ id, accountNumber, name, type,
                    status, currency, createdAt }] }
     Note: Customers see only their own accounts.
           Admins and Support see all (with ?userId= filter).

POST /api/v1/accounts
     Auth: Authenticated user (Customer)
     Body: { name, type }
     Response 201: { id, accountNumber, name, type, status, currency }
     Response 403: { error: "KYC_NOT_VERIFIED" }
     Response 409: { error: "MAXIMUM_ACCOUNTS_REACHED" }

GET  /api/v1/accounts/:accountId
     Auth: Owner, Support Agent, Auditor, Admin
     Response 200: { id, accountNumber, name, type, status, currency,
                    owner: { id, firstName, lastName }, createdAt }
     Response 403: { error: "FORBIDDEN" }
     Response 404: { error: "ACCOUNT_NOT_FOUND" }

DELETE /api/v1/accounts/:accountId
     Auth: Owner (Customer)
     Response 200: { message: "Account closed." }
     Response 422: { error: "ACCOUNT_HAS_BALANCE" }
     Response 422: { error: "ACCOUNT_NOT_ACTIVE" }

POST /api/v1/accounts/:accountId/freeze
     Auth: Support Agent, Admin
     Body: { reason }
     Response 200: { message: "Account frozen." }
     Response 422: { error: "ACCOUNT_ALREADY_FROZEN" }

POST /api/v1/accounts/:accountId/unfreeze
     Auth: Admin only
     Body: { reason }
     Response 200: { message: "Account unfrozen." }
     Response 422: { error: "ACCOUNT_NOT_FROZEN" }

GET  /api/v1/accounts/internal/:accountId
     Auth: Internal service API key
     Purpose: Called by Transfer and Deposit services to validate account eligibility
     Response 200: { id, status, currency, ownerId, accountNumber }
     Response 404: { error: "ACCOUNT_NOT_FOUND" }

GET  /api/v1/accounts/internal/validate
     Auth: Internal service API key
     Query: ?sourceAccountId=&destinationAccountId=&amount=
     Purpose: Pre-transfer validation — checks both accounts exist, are active,
              and the source owner has sufficient KYC status
     Response 200: { valid: true, sourceOwnerKycStatus: string }
     Response 200: { valid: false, reason: string }
```

### 6.16 Database Schema

```
Database: account_db

Table: accounts
Purpose: The canonical record of every financial account in the system.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  account_number  VARCHAR(15) NOT NULL UNIQUE
                  Generated format: 'ACC' + 12 random digits
  owner_id        UUID NOT NULL
                  The user ID of the account owner. Not a FK (different DB)
                  but validated via User Service call at creation time.
  name            VARCHAR(100) NOT NULL
                  User-provided friendly name (e.g. "My Savings", "Business")
  type            VARCHAR(20) NOT NULL DEFAULT 'wallet'
                  CHECK (type IN ('wallet','savings','business'))
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','frozen','closed'))
  currency        CHAR(3) NOT NULL DEFAULT 'INR'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  closed_at       TIMESTAMPTZ    -- set when status transitions to 'closed'
  deleted_at      TIMESTAMPTZ    -- soft delete (rare — accounts are closed not deleted)

Indexes:
  UNIQUE INDEX on account_number
  INDEX on owner_id                   -- "show all accounts for user X"
  INDEX on status                     -- "show all frozen accounts"
  INDEX on (owner_id, status)         -- "show active accounts for user X"
  INDEX on created_at
```

```
Table: account_status_history
Purpose: Immutable log of every status change on every account.
         This is separate from the main accounts table because status changes
         are events — they should never be overwritten, only appended.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  account_id      UUID NOT NULL REFERENCES accounts(id)
  previous_status VARCHAR(20) NOT NULL
  new_status      VARCHAR(20) NOT NULL
  changed_by      UUID NOT NULL    -- user ID of the actor (admin, support, or system)
  changed_by_role VARCHAR(50) NOT NULL
  reason          TEXT NOT NULL
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on account_id                 -- "show all status changes for account X"
  INDEX on occurred_at
  INDEX on changed_by
```

```
Table: account_limits
Purpose: Per-account operational limits. Separate table allows limits to be
         changed without touching the main account record.

Columns:
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
  account_id              UUID NOT NULL UNIQUE REFERENCES accounts(id)
  daily_transfer_limit    BIGINT NOT NULL DEFAULT 100000000   -- ₹1,000,000 in paise
  single_transfer_limit   BIGINT NOT NULL DEFAULT 50000000    -- ₹500,000 in paise
  monthly_transfer_limit  BIGINT NOT NULL DEFAULT 1000000000  -- ₹10,000,000 in paise
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  UNIQUE INDEX on account_id
```

### 6.17 Events Published

```typescript
// account.created
{
  eventType: "account.created",
  payload: {
    accountId: string,
    accountNumber: string,
    ownerId: string,
    type: AccountType,
    currency: string,
    occurredAt: string
  }
}

// account.frozen
{
  eventType: "account.frozen",
  payload: {
    accountId: string,
    accountNumber: string,
    ownerId: string,
    frozenBy: string,
    frozenByRole: string,
    reason: string,
    occurredAt: string
  }
}

// account.unfrozen
{
  eventType: "account.unfrozen",
  payload: {
    accountId: string,
    accountNumber: string,
    ownerId: string,
    unfrozenBy: string,
    reason: string,
    occurredAt: string
  }
}

// account.closed
{
  eventType: "account.closed",
  payload: {
    accountId: string,
    accountNumber: string,
    ownerId: string,
    closedBy: string,
    occurredAt: string
  }
}
```

### 6.18 Events Consumed

```
user.kyc_status_changed (from User Service)
  → If a user's KYC status changes to 'suspended', automatically freeze
    all of that user's active accounts.
  → If status changes to 'verified', no automatic action (accounts were
    already active if they existed; new accounts can now be created).
  → Idempotency: check current account status before applying freeze.
```

---

## Part C: The Ledger Service

### 6.19 Purpose

The Ledger Service is the financial heart of the system. It is the implementation of everything described in Chapter 3. It owns the double-entry accounting ledger, maintains the chart of accounts, calculates balances, and serves as the single authoritative source for all financial history.

Every rupee that moves through this system passes through the Ledger Service as an accounting entry. Nothing about financial state is stored anywhere else.

### 6.20 Responsibilities

- Maintaining the chart of accounts (customer accounts and system accounts)
- Accepting and validating transaction posting requests from authorised services
- Enforcing the double-entry constraint (total debits must equal total credits)
- Enforcing the non-negative balance constraint for asset accounts
- Calculating real-time account balances from ledger entries
- Serving paginated ledger entry history for any account
- Publishing events when transactions are posted
- Maintaining balance snapshots for performance
- Supporting reconciliation queries for the Operations Service

### 6.21 The Ledger Service's Security Model

Only two services are permitted to post transactions to the Ledger Service: the **Transfer Service** and the **Deposit Service**. This is enforced through internal API keys. Every other service can read from the Ledger Service (for balance queries and history) but cannot write to it.

This tight write-access control means that if a bug in the Notification Service somehow attempts to post a ledger transaction, it will be rejected. The blast radius of bugs is contained.

### 6.22 Business Rules

- Every posted transaction must have at least two entries (one debit, one credit).
- The sum of all DEBIT amounts must exactly equal the sum of all CREDIT amounts in a single transaction. If not, the transaction is rejected with `422 Unprocessable Entity`.
- An asset account's balance cannot go below zero as a result of a transaction. If a transaction would cause a negative balance, it is rejected with `422 Unprocessable Entity` and error code `INSUFFICIENT_FUNDS`.
- Transactions are posted atomically. Either all entries are written or none are.
- Once posted, a transaction's entries cannot be modified or deleted. The database enforces this with no `UPDATE` or `DELETE` permissions on the ledger entries table for the application user.
- System accounts (prefixed `SYS_`) can only be created through the Operations Service or database migrations. Application code cannot create system accounts.
- Balance snapshots are recalculated nightly by a scheduled job in the Scheduler Service.

### 6.23 Idempotency for Transaction Posting

Transaction posting is the most critical write operation in the entire system. If a transfer times out and is retried, the Ledger Service might receive the same transaction posting request twice. Without idempotency, money would move twice.

The Ledger Service accepts an `Idempotency-Key` header on all `POST /transactions` requests. This key (a UUID provided by the caller) is stored alongside the transaction. If a request arrives with an `Idempotency-Key` that already exists in the database, the Ledger Service returns the original response — it does not process the transaction again.

The `Idempotency-Key` is stored in the transactions table and has a unique constraint. The database itself enforces uniqueness, making the check atomic. Even under concurrent requests, only one can succeed.

### 6.24 API Endpoints

```
POST /api/v1/ledger/transactions
     Auth: Internal API key (Transfer Service or Deposit Service only)
     Headers: Idempotency-Key: <uuid>
     Body: {
       referenceId: string,      -- e.g. transfer ID or deposit ID
       referenceType: string,    -- "transfer" | "deposit" | "reversal"
       description: string,
       entries: [
         { accountId: string, entryType: "debit"|"credit", amount: number },
         { accountId: string, entryType: "debit"|"credit", amount: number },
         ...
       ],
       metadata?: object
     }
     Response 201: { transactionId, postedAt, entries: [...] }
     Response 409: { error: "IDEMPOTENCY_KEY_ALREADY_USED",
                     originalTransactionId: string }
     Response 422: { error: "ENTRIES_DO_NOT_BALANCE" }
     Response 422: { error: "INSUFFICIENT_FUNDS", accountId: string }
     Response 422: { error: "ACCOUNT_NOT_FOUND", accountId: string }
     Response 422: { error: "ACCOUNT_INVALID_FOR_LEDGER" }

GET  /api/v1/ledger/accounts/:accountId/balance
     Auth: JWT (owner, support, auditor, admin) or Internal API key
     Response 200: {
       accountId: string,
       balance: number,           -- in paise
       currency: string,
       calculatedAt: string,      -- timestamp of calculation
       snapshotUsed: boolean      -- was a snapshot used for efficiency?
     }

GET  /api/v1/ledger/accounts/:accountId/entries
     Auth: JWT (owner, support, auditor, admin)
     Query: ?from=<date>&to=<date>&limit=<n>&cursor=<cursor>
     Response 200: {
       entries: [{
         id: string,
         transactionId: string,
         entryType: "debit" | "credit",
         amount: number,
         description: string,
         referenceId: string,
         referenceType: string,
         postedAt: string
       }],
       pagination: { nextCursor: string | null, hasMore: boolean }
     }

GET  /api/v1/ledger/transactions/:transactionId
     Auth: Internal API key, Auditor, Admin
     Response 200: {
       id: string,
       referenceId: string,
       referenceType: string,
       description: string,
       entries: [...],
       totalDebits: number,
       totalCredits: number,
       postedAt: string
     }

GET  /api/v1/ledger/reconciliation/summary
     Auth: Internal API key (Operations Service only)
     Response 200: {
       totalDebits: number,
       totalCredits: number,
       difference: number,         -- must always be zero
       suspenseBalance: number,    -- should equal sum of in-flight transfers
       calculatedAt: string
     }

GET  /api/v1/ledger/accounts
     Auth: Internal API key (Admin access via Operations Service)
     Query: ?type=asset|liability|revenue|expense
     Response 200: { accounts: [{ id, name, type, balance }] }
```

### 6.25 Database Schema

```
Database: ledger_db
Note: This database uses a dedicated PostgreSQL application user that has
      INSERT and SELECT permissions on ledger_entries, but NO UPDATE or
      DELETE permissions. This is enforced at the database level, not just
      at the application level.

Table: ledger_accounts
Purpose: The chart of accounts. Every account that can hold money
         in the ledger must have a record here.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  account_ref     VARCHAR(100) NOT NULL UNIQUE
                  For customer accounts: matches the Account Service's account ID.
                  For system accounts: a human-readable key like 'SYS_SUSPENSE_TRANSFER'.
  name            VARCHAR(255) NOT NULL
  type            VARCHAR(20) NOT NULL
                  CHECK (type IN ('asset','liability','revenue','expense'))
  currency        CHAR(3) NOT NULL DEFAULT 'INR'
  is_system       BOOLEAN NOT NULL DEFAULT false
                  System accounts cannot be created by application code.
  is_active       BOOLEAN NOT NULL DEFAULT true
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  UNIQUE INDEX on account_ref
  INDEX on type
  INDEX on is_system
```

```
Table: ledger_transactions
Purpose: The accounting transaction — the unit of financial work.
         Groups related entries together.

Columns:
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
  idempotency_key     UUID NOT NULL UNIQUE
                      Caller-provided. Prevents duplicate transaction posting.
  reference_id        UUID NOT NULL
                      The ID from the source system (transfer ID, deposit ID).
  reference_type      VARCHAR(50) NOT NULL
                      CHECK (reference_type IN ('transfer','deposit','reversal',
                      'fee','refund','adjustment','opening_balance'))
  description         TEXT NOT NULL
  status              VARCHAR(20) NOT NULL DEFAULT 'posted'
                      In this system, all successfully created transactions
                      are immediately 'posted'. There is no pending state
                      at the ledger level — pending is a Transfer Service concept.
  metadata            JSONB
  posted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  posted_by_service   VARCHAR(100) NOT NULL
                      Which service posted this transaction (for audit).

Indexes:
  UNIQUE INDEX on idempotency_key
  INDEX on reference_id
  INDEX on reference_type
  INDEX on posted_at
  INDEX on (reference_type, reference_id)   -- "find all ledger transactions for transfer X"
```

```
Table: ledger_entries
Purpose: The individual debit and credit lines of each transaction.
         This is the core immutable financial record.
         CRITICAL: No UPDATE or DELETE permitted on this table.

Columns:
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
  transaction_id      UUID NOT NULL REFERENCES ledger_transactions(id)
  account_id          UUID NOT NULL REFERENCES ledger_accounts(id)
  entry_type          CHAR(6) NOT NULL CHECK (entry_type IN ('debit', 'credit'))
  amount              BIGINT NOT NULL CHECK (amount > 0)
                      Always positive. The entry_type determines direction.
                      Stored in paise (smallest denomination).
  currency            CHAR(3) NOT NULL DEFAULT 'INR'
  running_balance     BIGINT
                      Optionally maintained for display purposes only.
                      NOT used for balance calculations (derived is authoritative).
  description         TEXT
  metadata            JSONB
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on transaction_id
  INDEX on account_id
  INDEX on (account_id, created_at)    -- the primary query pattern for ledger history
  INDEX on created_at
  -- Partial index for fast balance calculation on active accounts:
  INDEX on (account_id, entry_type, amount)
```

```
Table: balance_snapshots
Purpose: Periodic materialised balances for performance.
         Instead of summing all entries since account creation,
         we sum from the most recent snapshot.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  account_id      UUID NOT NULL REFERENCES ledger_accounts(id)
  balance         BIGINT NOT NULL
                  The calculated balance at snapshot_at time.
  snapshot_at     TIMESTAMPTZ NOT NULL
                  The timestamp up to which entries are included in this balance.
  entry_count     INTEGER NOT NULL
                  How many entries were included. Useful for verification.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on (account_id, snapshot_at DESC)  -- find latest snapshot for an account
  UNIQUE INDEX on (account_id, snapshot_at)
```

### 6.26 The Balance Calculation Query

For transparency, here is the logic (not the code) for calculating a current balance using snapshots:

**Step 1:** Find the most recent snapshot for the account. Get its `balance` and `snapshot_at` timestamp.

**Step 2:** Sum all ledger entries for this account created after `snapshot_at`.
- For DEBIT entries on asset accounts: add to the snapshot balance.
- For CREDIT entries on asset accounts: subtract from the snapshot balance.

**Step 3:** Return the result as the current balance.

If no snapshot exists (new account), sum all entries from the beginning of time.

This query pattern is why the index on `(account_id, created_at)` is critical — it allows the database to efficiently scan only the entries after the snapshot date.

### 6.27 Events Published

```typescript
// ledger.transaction.posted
{
  eventType: "ledger.transaction.posted",
  payload: {
    transactionId: string,
    referenceId: string,
    referenceType: string,
    entries: [
      {
        accountId: string,
        entryType: "debit" | "credit",
        amount: number,
        currency: string
      }
    ],
    description: string,
    postedAt: string
  }
}

// ledger.reconciliation.completed
{
  eventType: "ledger.reconciliation.completed",
  payload: {
    totalDebits: number,
    totalCredits: number,
    difference: number,
    isPassed: boolean,
    calculatedAt: string
  }
}

// ledger.reconciliation.failed
{
  eventType: "ledger.reconciliation.failed",
  payload: {
    totalDebits: number,
    totalCredits: number,
    difference: number,
    calculatedAt: string,
    severity: "critical"
  }
}
```

### 6.28 Events Consumed

```
account.created (from Account Service)
  → Creates a corresponding ledger_accounts record so that the account
    can receive ledger entries. Without this, the Ledger Service does
    not know about accounts that exist in the Account Service.
  → Idempotency: unique constraint on account_ref prevents duplicates.

transfer.reversal_requested (from Transfer Service)
  → Not handled as an event — reversals are posted as new transactions
    through the synchronous API. This is a design choice: reversals must
    be immediate and need a synchronous response confirming they succeeded.
```

### 6.29 Folder Structure

```
services/ledger-service/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── index.ts
│   ├── routes/
│   │   └── v1/
│   │       ├── transactions.routes.ts
│   │       ├── accounts.routes.ts
│   │       └── health.routes.ts
│   ├── controllers/
│   │   ├── transactions.controller.ts
│   │   └── accounts.controller.ts
│   ├── services/
│   │   ├── ledger.service.ts        # Core posting and validation logic
│   │   ├── balance.service.ts       # Balance calculation logic
│   │   └── reconciliation.service.ts
│   ├── repositories/
│   │   ├── transaction.repository.ts
│   │   ├── entry.repository.ts
│   │   └── account.repository.ts
│   ├── events/
│   │   ├── publishers/
│   │   │   └── ledger.publisher.ts
│   │   └── consumers/
│   │       └── account.consumer.ts
│   ├── validators/
│   │   └── transaction.validator.ts
│   └── types/
│       └── ledger.types.ts
├── db/
│   └── migrations/
│       ├── 001_create_ledger_accounts.sql
│       ├── 002_create_ledger_transactions.sql
│       ├── 003_create_ledger_entries.sql
│       ├── 004_create_balance_snapshots.sql
│       ├── 005_insert_system_accounts.sql
│       └── 006_revoke_update_delete_on_entries.sql
├── tests/
│   ├── unit/
│   │   ├── ledger.service.test.ts
│   │   └── balance.service.test.ts
│   └── integration/
│       └── ledger.api.test.ts
├── Dockerfile
└── package.json
```

### 6.30 Scaling Considerations

The Ledger Service will become the highest-read service in the system. Every balance check, every ledger history view hits it. Read scaling is achieved through **read replicas** — additional PostgreSQL instances that receive replicated data from the primary. Read queries (balance calculations, history pagination) are routed to replicas. Write queries (posting transactions) always go to the primary.

The balance snapshot mechanism is the most important performance optimisation. Without it, a user with three years of daily transactions would require a full-table scan on every balance check.

The `ledger_entries` table will be the largest table in the system by several orders of magnitude. Partitioning this table by `created_at` (monthly partitions) allows PostgreSQL to skip entire partitions when querying recent entries, dramatically improving query performance as the table grows.

---

### Key Concepts — Chapter 6

- The User Service owns profile data; it is created reactively from the `user.registered` event, not by direct call from the Auth Service.
- KYC status gates financial operations; it can only be updated by the Operations Service.
- The Account Service owns account identity, ownership, and status — not balances.
- Account status transitions follow a strict state machine enforced at the application and database levels.
- The Ledger Service is the financial authority; only the Transfer Service and Deposit Service may post transactions to it.
- The Ledger Service's application database user has no UPDATE or DELETE permissions on ledger entries — immutability is enforced at the database level.
- Idempotency keys on transaction posting prevent duplicate financial entries under retries.
- Balance snapshots make balance calculations efficient for accounts with long history.
- The `account.created` event triggers ledger account creation — the two services stay in sync via events, not shared databases.

---

### Before You Continue — Chapter 6 Checklist

Before reading Chapter 7, make sure you can answer these:

1. Why is the User Service's profile created by consuming an event rather than being called directly by the Auth Service?
2. A user with KYC status `pending` tries to create an account. Trace the request through the system and explain where it is rejected and why.
3. What is the account status state machine? Why can a Support Agent freeze but not unfreeze an account?
4. Why does the Ledger Service have its own `ledger_accounts` table rather than querying the Account Service for account information?
5. Explain the idempotency mechanism for transaction posting. What database feature makes it atomic?
6. A user has 50,000 ledger entries spanning three years. How does the system calculate their balance without scanning all 50,000 entries on every request?
7. The Ledger Service's application database user has no UPDATE or DELETE permissions on ledger_entries. Why? Who configured this and when?

---

## Chapter 7: Service Design — Transfer Service, Deposit Service & The Saga Pattern

---

### 7.1 Why This Chapter Is the Most Complex

Everything built so far — the Auth Service, User Service, Account Service, and Ledger Service — has been relatively self-contained. Each service manages its own data and responds to requests within its own boundary.

The Transfer Service breaks this pattern. Moving money from one account to another is not a single operation. It is a **distributed process** that spans multiple services, involves multiple database writes across multiple databases, and can fail at any point along the way. When it fails partway through, the system must recover to a consistent state without human intervention.

This is the hardest problem in distributed systems: **how do you coordinate a multi-step operation across multiple services such that either all steps succeed or the system returns to its original state, with no money lost or duplicated along the way?**

The answer is the **Saga Pattern**. Understanding it thoroughly before building the Transfer Service is essential. This chapter teaches it from first principles.

---

## Part A: The Saga Pattern

### 7.2 Why Distributed Transactions Are Difficult

In a single database, you have transactions. If you want to update two tables atomically — either both updates succeed or neither does — you wrap them in a database transaction:

```
BEGIN;
  UPDATE table_a SET ...;
  UPDATE table_b SET ...;
COMMIT;
```

If anything fails between `BEGIN` and `COMMIT`, the database rolls everything back. You are guaranteed consistency.

In a distributed system, you have no such luxury. The Account Service has its own database. The Ledger Service has its own database. When a transfer executes, it needs to update data in both. There is no `BEGIN` and `COMMIT` that spans both databases simultaneously.

You might have heard of **two-phase commit (2PC)**, which attempts to provide distributed atomicity. Two-phase commit requires all participating databases to coordinate a prepare phase and a commit phase simultaneously. In practice, 2PC is slow, fragile, and does not work across services with different database technologies. It creates tight coupling and can leave systems in a locked state if the coordinator crashes during the commit phase. Modern distributed systems have largely abandoned it.

The Saga Pattern is the practical alternative.

### 7.3 What Is a Saga?

A **Saga** is a sequence of local transactions, where each local transaction updates one service's database and publishes an event or calls the next step. If any step fails, the saga executes **compensating transactions** — previously defined reversal operations — to undo the work done by all preceding steps.

The name comes from Norse literature — a saga is a long story with a series of events. Each event in the saga moves the story forward, and if something goes wrong, the story unravels in reverse.

There are two styles of Saga:

**Choreography-based Saga**: Each service listens for events and decides what to do next. There is no central coordinator. Service A completes its step and publishes an event. Service B hears the event and performs its step. If Service B fails, it publishes a failure event that Service A hears and uses to trigger its compensation.

**Orchestration-based Saga**: A central orchestrator (the Transfer Service, in this case) commands each participant. It calls Service A, waits for the result, calls Service B, and so on. If any step fails, the orchestrator explicitly calls the compensation operations on all previously completed steps.

For this system, **orchestration is the right choice for the transfer flow**. Here is why: the Transfer Service is the business owner of a transfer. It knows the sequence of steps, the business rules, and the failure conditions. Centralising this logic in one place makes it readable, debuggable, and testable. With choreography, the transfer logic is spread across multiple services, making it harder to understand what is happening at any given moment.

### 7.4 The Successful Transfer Saga — Step by Step

Before examining failure, understand what success looks like. Alice sends ₹500 (50,000 paise) to Bob's account. Here is the complete orchestrated saga:

---

**Step 1: Validate the transfer request**

The Transfer Service receives the HTTP request. It validates the request payload (amounts are positive, accounts are different, required fields are present). This is synchronous validation that happens before the saga starts. If this fails, the request is rejected immediately with a `422` error. No saga is created.

**Step 2: Create a transfer record (PENDING status)**

The Transfer Service writes a transfer record to its own database with status `PENDING`. This record is the saga's state machine. It tracks which step the saga is on and what has been completed. If the Transfer Service crashes and restarts, it can read this record and determine where to resume.

At this point, the API can return `202 Accepted` to the client. The transfer has been received and is being processed. This is important: the transfer completes asynchronously. The client does not wait for the entire saga to finish before getting a response.

**Step 3: Validate accounts**

The Transfer Service calls the Account Service's internal API synchronously: "Are both accounts active, do they exist, and does the source account belong to the authenticated user?"

If validation fails: update the transfer record to `FAILED`, publish `transfer.failed` event, return error to client. No compensation needed — nothing financial has happened yet.

**Step 4: Check KYC status**

The Transfer Service calls the User Service's internal API: "Is the owner of the source account KYC-verified?"

If KYC is not verified: update transfer to `FAILED`, publish `transfer.failed`.

**Step 5: Check transfer limits**

The Transfer Service fetches the account's transfer limits from the Account Service and verifies the amount does not exceed them.

**Step 6: Check approval requirement**

Transfers above a configured threshold (₹1,00,000 by default) require manager approval. If this transfer exceeds the threshold, the Transfer Service creates an approval request in the Approval Service and updates the transfer status to `PENDING_APPROVAL`. The saga pauses here. It will resume when the Approval Service publishes `approval.approved` or `approval.rejected`.

If the transfer is below the threshold, proceed directly to Step 7.

**Step 7: Reserve funds (Phase 1 Ledger Entry)**

The Transfer Service calls the Ledger Service synchronously to post Phase 1 of the accounting transaction:

```
Transaction: "Transfer Phase 1 — Reserve funds"
Entry 1: CREDIT alice_wallet  50,000 paise
Entry 2: DEBIT  SYS_SUSPENSE_TRANSFER  50,000 paise
```

Alice's balance decreases. The money is now in the suspense account. If this call fails: update transfer to `FAILED`, publish `transfer.failed`. No compensation needed — the Ledger Service either posts both entries atomically or posts nothing.

Update the transfer record to `FUNDS_RESERVED`. This is a crucial checkpoint — the Transfer Service now knows Phase 1 has succeeded.

**Step 8: Complete the transfer (Phase 2 Ledger Entry)**

The Transfer Service calls the Ledger Service synchronously to post Phase 2:

```
Transaction: "Transfer Phase 2 — Complete transfer"
Entry 1: CREDIT SYS_SUSPENSE_TRANSFER  50,000 paise
Entry 2: DEBIT  bob_wallet  50,000 paise
```

The suspense account returns to zero. Bob's balance increases.

If this call fails: **compensation is required**. The Transfer Service must reverse Phase 1. See the failure flow below.

Update the transfer record to `COMPLETED`.

**Step 9: Publish completion event**

The Transfer Service publishes `transfer.completed`. The Notification Service and Audit Service consume this event asynchronously. The transfer saga is complete.

---

### 7.5 The Failed Transfer Saga — With Compensation

Now consider what happens when Step 8 fails — the Ledger Service is temporarily unavailable when Phase 2 is attempted.

At this point:
- Alice's wallet has been debited (Phase 1 succeeded)
- The suspense account holds Alice's ₹500
- Bob's wallet has not been credited
- The transfer record is in status `FUNDS_RESERVED`

The system is in an **inconsistent intermediate state**. Alice has lost ₹500 and Bob has received nothing. This must be corrected.

**Compensation Step: Reverse Phase 1**

The Transfer Service detects the failure of Phase 2. It updates the transfer record to `REVERSING`. It calls the Ledger Service to post a compensating transaction:

```
Transaction: "Transfer Reversal — Phase 1 compensation"
Entry 1: CREDIT SYS_SUSPENSE_TRANSFER  50,000 paise
Entry 2: DEBIT  alice_wallet  50,000 paise
```

This exactly reverses Phase 1. The suspense account returns to zero. Alice's wallet balance is restored to its pre-transfer value.

Update the transfer record to `REVERSED`. Publish `transfer.reversed` event.

The system is now back to a consistent state. Alice has her money. Bob has received nothing. The transfer has failed cleanly with no money lost.

---

### 7.6 The Saga State Machine

The transfer record's `status` field is a state machine. Every valid transition is explicit:

```
PENDING
  → PENDING_APPROVAL    (requires manager approval)
  → FUNDS_RESERVED      (Phase 1 ledger entries posted)
  → FAILED              (validation failed before any financial operation)

PENDING_APPROVAL
  → FUNDS_RESERVED      (approval granted, proceed with Phase 1)
  → FAILED              (approval rejected)

FUNDS_RESERVED
  → COMPLETED           (Phase 2 ledger entries posted)
  → REVERSING           (Phase 2 failed, compensation initiated)

REVERSING
  → REVERSED            (compensation succeeded)
  → REVERSAL_FAILED     (compensation also failed — requires manual intervention)

COMPLETED             [terminal — no further transitions]
FAILED                [terminal]
REVERSED              [terminal]
REVERSAL_FAILED       [requires human intervention — highest severity alert]
```

The `REVERSAL_FAILED` state is the most dangerous. It means Phase 1 succeeded (Alice's money left her wallet) but both Phase 2 and the compensation failed. Alice's money is stuck in the suspense account. This requires a human operator to investigate and manually apply the correction. The Operations Service dashboard must alert immediately on any transfer entering `REVERSAL_FAILED` status.

---

### 7.7 Saga Durability: Surviving Crashes

What happens if the Transfer Service crashes while a saga is in progress?

This is handled by the transfer record in the database. When the Transfer Service restarts, it queries for all transfers that are not in a terminal state (`COMPLETED`, `FAILED`, `REVERSED`, `REVERSAL_FAILED`). For each non-terminal transfer, it determines the appropriate recovery action based on the current status:

- `PENDING` — Restart from Step 3 (account validation). Safe to retry because no financial operations have occurred.
- `PENDING_APPROVAL` — Check the Approval Service for the current approval status. If approved, proceed; if rejected, fail; if still pending, leave it.
- `FUNDS_RESERVED` — Phase 1 completed but Phase 2 did not. Attempt Phase 2 again. If it fails again after retries, initiate compensation.
- `REVERSING` — Compensation was initiated but may not have completed. Attempt compensation again (the Ledger Service is idempotent with its idempotency key).

This recovery process runs on a schedule (every minute) and handles all in-flight sagas that survived a service restart. It is the distributed system equivalent of a database transaction log replay.

---

## Part B: The Transfer Service

### 7.8 Purpose

The Transfer Service is the orchestrator of the money movement process. It owns the business logic of transfers, coordinates the saga steps, manages the approval workflow integration, and is the single service that clients interact with to move money.

### 7.9 Responsibilities

- Accepting transfer requests from authenticated users
- Validating transfer eligibility (accounts, limits, KYC)
- Orchestrating the transfer saga (Phase 1 and Phase 2 ledger entries)
- Managing the approval workflow for large transfers
- Handling saga compensation (reversals) when steps fail
- Recovery of interrupted sagas after service restart
- Providing transfer history to users and auditors

### 7.10 Business Rules

- A transfer must have a source account and a destination account that are different from each other.
- The source account must be owned by the authenticated user.
- Both accounts must be in `active` status.
- The amount must be a positive integer (in paise).
- The amount must not exceed the account's single transfer limit.
- The user's daily transfer total (source account) must not exceed the daily transfer limit.
- Transfers above ₹1,00,000 (10,000,000 paise) require manager approval before proceeding.
- An idempotency key is required on every transfer request. Duplicate requests (same key) return the original transfer without creating a new one.
- A transfer cannot be initiated from or to a `frozen` or `closed` account.
- Internal transfers (between two accounts owned by the same user) follow the same rules as external transfers.

### 7.11 API Endpoints

```
POST /api/v1/transfers
     Auth: Customer (owner of source account)
     Headers: Idempotency-Key: <uuid>
     Body: {
       sourceAccountId: string,
       destinationAccountId: string,
       amount: number,           -- in paise
       currency: "INR",
       description?: string,
       scheduledAt?: string      -- ISO 8601; if absent, execute immediately
     }
     Response 202: {
       transferId: string,
       status: "pending" | "pending_approval",
       message: string,
       estimatedCompletionAt?: string
     }
     Response 409: {
       error: "IDEMPOTENCY_KEY_ALREADY_USED",
       existingTransferId: string,
       existingStatus: string
     }
     Response 422: { error: "INSUFFICIENT_FUNDS" }
     Response 422: { error: "ACCOUNT_FROZEN" }
     Response 422: { error: "EXCEEDS_TRANSFER_LIMIT" }
     Response 403: { error: "KYC_NOT_VERIFIED" }

GET  /api/v1/transfers
     Auth: Customer (own transfers), Support, Auditor, Admin (all)
     Query: ?accountId=&status=&from=&to=&limit=&cursor=
     Response 200: {
       transfers: [{
         id, status, sourceAccountId, destinationAccountId,
         amount, currency, description, createdAt, completedAt
       }],
       pagination: { nextCursor, hasMore }
     }

GET  /api/v1/transfers/:transferId
     Auth: Owner of source or destination account, Support, Auditor, Admin
     Response 200: {
       id, status, sourceAccountId, destinationAccountId,
       amount, currency, description,
       sagaSteps: [{
         step, status, occurredAt, metadata
       }],
       approvalId?: string,
       ledgerTransactionIds: string[],
       createdAt, updatedAt, completedAt
     }

POST /api/v1/transfers/internal/process-scheduled
     Auth: Internal API key (Scheduler Service only)
     Body: { scheduleId: string, transferId: string }
     Response 202: { message: "Scheduled transfer processing initiated." }
```

### 7.12 Database Schema

```
Database: transfer_db

Table: transfers
Purpose: The saga state record. Tracks every transfer and its current
         position in the saga.

Columns:
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
  idempotency_key         UUID NOT NULL UNIQUE
  source_account_id       UUID NOT NULL
  destination_account_id  UUID NOT NULL
  amount                  BIGINT NOT NULL CHECK (amount > 0)
  currency                CHAR(3) NOT NULL DEFAULT 'INR'
  description             TEXT
  status                  VARCHAR(30) NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'pending_approval', 'funds_reserved',
                            'completed', 'failed', 'reversing', 'reversed',
                            'reversal_failed', 'scheduled'
                          ))
  initiated_by            UUID NOT NULL    -- user ID of the requester
  approval_id             UUID             -- set if approval was required
  phase1_transaction_id   UUID             -- ledger transaction ID for Phase 1
  phase2_transaction_id   UUID             -- ledger transaction ID for Phase 2
  reversal_transaction_id UUID             -- ledger transaction ID for reversal
  failure_reason          TEXT             -- why the transfer failed
  scheduled_at            TIMESTAMPTZ      -- if this is a scheduled transfer
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  completed_at            TIMESTAMPTZ      -- set when status = 'completed'
  failed_at               TIMESTAMPTZ

Indexes:
  UNIQUE INDEX on idempotency_key
  INDEX on source_account_id
  INDEX on destination_account_id
  INDEX on status
  INDEX on initiated_by
  INDEX on created_at
  INDEX on scheduled_at WHERE status = 'scheduled'
  INDEX on (status) WHERE status NOT IN ('completed','failed','reversed')
  -- the last index efficiently finds in-flight sagas for recovery
```

```
Table: transfer_saga_events
Purpose: Immutable log of every step in every saga execution.
         Used for debugging, auditing, and recovery.

Columns:
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
  transfer_id   UUID NOT NULL REFERENCES transfers(id)
  step_name     VARCHAR(100) NOT NULL
                e.g. 'account_validation', 'phase1_ledger', 'phase2_ledger',
                     'compensation_initiated', 'compensation_completed'
  status        VARCHAR(20) NOT NULL CHECK (status IN ('started','completed','failed'))
  input         JSONB         -- what data the step received
  output        JSONB         -- what data the step produced (sanitised, no PII)
  error         TEXT          -- error message if failed
  duration_ms   INTEGER       -- how long this step took
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on transfer_id
  INDEX on occurred_at
  INDEX on (transfer_id, step_name)
```

```
Table: daily_transfer_totals
Purpose: Tracks each account's total transfer amount per day for limit checking.
         Updated atomically when a transfer is initiated (before saga starts).

Columns:
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
  account_id    UUID NOT NULL
  date          DATE NOT NULL
  total_amount  BIGINT NOT NULL DEFAULT 0
  transfer_count INTEGER NOT NULL DEFAULT 0
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()

Constraints:
  UNIQUE (account_id, date)

Indexes:
  UNIQUE INDEX on (account_id, date)
  INDEX on date   -- for cleanup of old records
```

### 7.13 Events Published

```typescript
// transfer.requested — when a transfer record is first created
{
  eventType: "transfer.requested",
  payload: {
    transferId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    initiatedBy: string,
    requiresApproval: boolean,
    occurredAt: string
  }
}

// transfer.pending_approval
{
  eventType: "transfer.pending_approval",
  payload: {
    transferId: string,
    approvalId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    initiatedBy: string,
    occurredAt: string
  }
}

// transfer.completed
{
  eventType: "transfer.completed",
  payload: {
    transferId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    sourceOwnerId: string,
    destinationOwnerId: string,
    amount: number,
    currency: string,
    phase1TransactionId: string,
    phase2TransactionId: string,
    occurredAt: string
  }
}

// transfer.failed
{
  eventType: "transfer.failed",
  payload: {
    transferId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    reason: string,
    failureCode: string,
    occurredAt: string
  }
}

// transfer.reversed
{
  eventType: "transfer.reversed",
  payload: {
    transferId: string,
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    reversalTransactionId: string,
    occurredAt: string
  }
}

// transfer.reversal_failed — CRITICAL ALERT
{
  eventType: "transfer.reversal_failed",
  payload: {
    transferId: string,
    sourceAccountId: string,
    amount: number,
    currency: string,
    phase1TransactionId: string,
    lastError: string,
    requiresManualIntervention: true,
    occurredAt: string
  }
}
```

### 7.14 Events Consumed

```
approval.approved (from Approval Service)
  → Resume the saga from PENDING_APPROVAL → FUNDS_RESERVED.
  → The consumer verifies the approvalId matches the transfer's approvalId,
    then proceeds with Phase 1 ledger entry.

approval.rejected (from Approval Service)
  → Update transfer to FAILED. Publish transfer.failed.

schedule.transfer_due (from Scheduler Service)
  → Triggers processing of a scheduled transfer.
  → Treated as a new saga initiation for the scheduled transfer.
```

### 7.15 The Daily Limit Check — Concurrency Safety

The daily transfer total check is a classic concurrency problem. Two transfers of ₹600,000 might both read the daily total as ₹500,000 and both conclude they are below the ₹1,000,000 limit. Both proceed. The actual total becomes ₹1,700,000 — exceeding the limit.

The solution is a **database-level atomic increment with a constraint check**:

```sql
-- Conceptual SQL logic (not literal implementation code)
INSERT INTO daily_transfer_totals (account_id, date, total_amount)
VALUES ($accountId, CURRENT_DATE, $amount)
ON CONFLICT (account_id, date)
DO UPDATE SET
  total_amount = daily_transfer_totals.total_amount + $amount,
  transfer_count = daily_transfer_totals.transfer_count + 1
WHERE daily_transfer_totals.total_amount + $amount <= $dailyLimit
RETURNING total_amount;
```

The `WHERE` clause in the `UPDATE` means the update only succeeds if the new total would not exceed the limit. If the update fails because the limit would be exceeded, zero rows are updated, and the application detects this and rejects the transfer. This check is atomic — no race condition is possible because the read and write happen in a single database operation.

### 7.16 Folder Structure

```
services/transfer-service/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── index.ts
│   ├── routes/
│   │   └── v1/
│   │       ├── transfer.routes.ts
│   │       └── health.routes.ts
│   ├── controllers/
│   │   └── transfer.controller.ts
│   ├── services/
│   │   ├── transfer.service.ts      # Orchestrates the saga
│   │   ├── saga.service.ts          # Saga step execution and recovery
│   │   ├── validation.service.ts    # Pre-saga eligibility checks
│   │   └── recovery.service.ts      # In-flight saga recovery on restart
│   ├── repositories/
│   │   ├── transfer.repository.ts
│   │   ├── saga-event.repository.ts
│   │   └── daily-limit.repository.ts
│   ├── clients/
│   │   ├── account.client.ts        # HTTP client for Account Service
│   │   ├── user.client.ts           # HTTP client for User Service
│   │   ├── ledger.client.ts         # HTTP client for Ledger Service
│   │   └── approval.client.ts       # HTTP client for Approval Service
│   ├── events/
│   │   ├── publishers/
│   │   │   └── transfer.publisher.ts
│   │   └── consumers/
│   │       ├── approval.consumer.ts
│   │       └── schedule.consumer.ts
│   ├── validators/
│   │   └── transfer.validator.ts
│   └── types/
│       └── transfer.types.ts
├── db/
│   └── migrations/
│       ├── 001_create_transfers.sql
│       ├── 002_create_saga_events.sql
│       └── 003_create_daily_limits.sql
├── tests/
│   ├── unit/
│   │   ├── saga.service.test.ts
│   │   └── validation.service.test.ts
│   └── integration/
│       └── transfer.api.test.ts
├── Dockerfile
└── package.json
```

---

## Part C: The Deposit Service

### 7.17 Purpose

The Deposit Service handles money **entering** the platform. In a real fintech system, this would involve integrating with payment gateways, bank transfer networks, and UPI. In this learning project, deposits are simplified: an admin can credit an account directly, or a simulated payment gateway callback triggers a deposit.

Despite being simpler than transfers, deposits still require the full double-entry accounting treatment. When money enters the system, it must be recorded as both a credit and a debit across appropriate accounts.

### 7.18 The Accounting Model for Deposits

When ₹1,000 is deposited into Alice's account:

```
Phase 1 — Deposit Received (payment received from external source):
  DEBIT  SYS_SUSPENSE_DEPOSIT      100,000 paise
  CREDIT SYS_EXTERNAL_INFLOW       100,000 paise

Phase 2 — Deposit Settled (funds posted to customer account):
  DEBIT  alice_wallet               100,000 paise
  CREDIT SYS_SUSPENSE_DEPOSIT       100,000 paise
```

The `SYS_EXTERNAL_INFLOW` account represents value coming into the system from the external world. Its balance tells you the total value that has ever entered the platform. The suspense account temporarily holds the funds during processing. After Phase 2, the suspense is cleared and Alice has her money.

For admin credits (the Operations Service crediting a user's account directly), a simpler two-entry model is used:

```
Admin Credit:
  DEBIT  target_wallet              amount
  CREDIT SYS_ADMIN_CREDIT_FACILITY  amount
```

The `SYS_ADMIN_CREDIT_FACILITY` is a special system account whose balance tracks all administrative credits. This makes it auditable — you can always see exactly how much money admins have injected into the system.

### 7.19 Business Rules

- Deposits can only be initiated by authenticated users (for self-deposits) or by admin users (for account credits).
- The deposit amount must be a positive integer in paise.
- The destination account must be in `active` status.
- A deposit has statuses: `initiated`, `processing`, `completed`, `failed`.
- Deposits are idempotent: a duplicate deposit request (same idempotency key) returns the original deposit.
- Admin credits require a mandatory reason field and are subject to enhanced audit logging.
- A deposit cannot be cancelled once it is in `processing` status.

### 7.20 API Endpoints

```
POST /api/v1/deposits
     Auth: Authenticated user
     Headers: Idempotency-Key: <uuid>
     Body: {
       destinationAccountId: string,
       amount: number,          -- in paise
       currency: "INR",
       paymentMethod: "simulated_upi" | "simulated_bank_transfer",
       paymentReference?: string
     }
     Response 202: {
       depositId: string,
       status: "initiated",
       message: "Deposit initiated. Awaiting payment confirmation."
     }

POST /api/v1/deposits/callback
     Auth: Internal API key (payment gateway simulation)
     Body: {
       depositId: string,
       paymentReference: string,
       status: "success" | "failed",
       amount: number
     }
     Response 200: { acknowledged: true }

POST /api/v1/deposits/admin-credit
     Auth: Admin only
     Headers: Idempotency-Key: <uuid>
     Body: {
       destinationAccountId: string,
       amount: number,
       reason: string,          -- mandatory for admin credits
       referenceNote?: string
     }
     Response 201: {
       depositId: string,
       status: "completed",
       ledgerTransactionId: string
     }

GET  /api/v1/deposits/:depositId
     Auth: Owner of destination account, Admin, Auditor
     Response 200: {
       id, status, destinationAccountId, amount, currency,
       paymentMethod, paymentReference, ledgerTransactionId,
       createdAt, completedAt
     }

GET  /api/v1/deposits
     Auth: Customer (own), Admin, Auditor (all)
     Query: ?accountId=&status=&from=&to=
     Response 200: { deposits: [...], pagination: {...} }
```

### 7.21 Database Schema

```
Database: deposit_db

Table: deposits
Purpose: Records every deposit attempt and its lifecycle status.

Columns:
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
  idempotency_key         UUID NOT NULL UNIQUE
  destination_account_id  UUID NOT NULL
  owner_id                UUID NOT NULL    -- account owner's user ID
  amount                  BIGINT NOT NULL CHECK (amount > 0)
  currency                CHAR(3) NOT NULL DEFAULT 'INR'
  payment_method          VARCHAR(50) NOT NULL
  payment_reference       VARCHAR(255)     -- external payment system reference
  status                  VARCHAR(20) NOT NULL DEFAULT 'initiated'
                          CHECK (status IN
                          ('initiated','processing','completed','failed'))
  initiated_by            UUID NOT NULL    -- user or admin ID
  initiated_by_role       VARCHAR(50) NOT NULL
  is_admin_credit         BOOLEAN NOT NULL DEFAULT false
  admin_credit_reason     TEXT             -- required if is_admin_credit = true
  phase1_transaction_id   UUID             -- ledger transaction ID
  phase2_transaction_id   UUID
  failure_reason          TEXT
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  completed_at            TIMESTAMPTZ

Indexes:
  UNIQUE INDEX on idempotency_key
  INDEX on destination_account_id
  INDEX on owner_id
  INDEX on status
  INDEX on created_at
  INDEX on is_admin_credit WHERE is_admin_credit = true
  INDEX on payment_reference WHERE payment_reference IS NOT NULL
```

### 7.22 Deposit Processing Flow

```
1. POST /deposits received
   → Validate request (account exists, is active, amount is valid)
   → Check idempotency key
   → Create deposit record (status: initiated)
   → Initiate payment with payment gateway (simulated in this system)
   → Update status to 'processing'
   → Return 202 to client

2. Payment gateway sends callback (POST /deposits/callback)
   → Validate callback signature (in production, gateways sign callbacks)
   → Find deposit by depositId
   → Verify amount matches
   → If success:
       → Post Phase 1 ledger entries
       → Post Phase 2 ledger entries
       → Update deposit status to 'completed'
       → Publish deposit.completed event
   → If failed:
       → Update deposit status to 'failed'
       → Publish deposit.failed event
       → Return 200 (always ack callbacks to prevent gateway retries)

3. Admin credit (immediate, no payment gateway involved)
   → Validate request
   → Check idempotency key
   → Create deposit record (is_admin_credit = true)
   → Post direct ledger credit (single two-entry transaction)
   → Update deposit status to 'completed'
   → Publish deposit.completed event
   → Return 201 with transaction ID
```

### 7.23 Events Published

```typescript
// deposit.initiated
{
  eventType: "deposit.initiated",
  payload: {
    depositId: string,
    destinationAccountId: string,
    ownerId: string,
    amount: number,
    currency: string,
    paymentMethod: string,
    occurredAt: string
  }
}

// deposit.completed
{
  eventType: "deposit.completed",
  payload: {
    depositId: string,
    destinationAccountId: string,
    ownerId: string,
    amount: number,
    currency: string,
    isAdminCredit: boolean,
    ledgerTransactionId: string,
    occurredAt: string
  }
}

// deposit.failed
{
  eventType: "deposit.failed",
  payload: {
    depositId: string,
    destinationAccountId: string,
    ownerId: string,
    amount: number,
    currency: string,
    reason: string,
    occurredAt: string
  }
}

// deposit.admin_credit_applied — separate event for enhanced auditability
{
  eventType: "deposit.admin_credit_applied",
  payload: {
    depositId: string,
    destinationAccountId: string,
    ownerId: string,
    amount: number,
    currency: string,
    adminUserId: string,
    reason: string,
    ledgerTransactionId: string,
    occurredAt: string
  }
}
```

### 7.24 Failure Scenarios for Both Services

**Transfer Service: Phase 2 fails after Phase 1 succeeded.**
The most critical failure. The transfer record is in `FUNDS_RESERVED`. On restart, the recovery service detects this and attempts Phase 2. If Phase 2 continues to fail after three attempts, the recovery service initiates compensation (reverse Phase 1). If compensation also fails, the transfer enters `REVERSAL_FAILED` and a critical alert is raised.

**Transfer Service: The service crashes while writing the transfer record in Step 2.**
No saga has started. No financial operations have occurred. The client's request timed out. The client retries using the same idempotency key. The Transfer Service creates the transfer record and begins the saga. Because the previous attempt never completed the database write, there is no duplicate — the idempotency key was never persisted.

**Deposit Service: Payment gateway sends the callback twice.**
The callback handler checks if the deposit is already in `completed` status. If yes, it returns `200` immediately without reprocessing. The ledger is idempotent via idempotency keys, but the deposit status check is an earlier, cheaper guard.

**Deposit Service: The ledger transaction fails during admin credit.**
The admin credit is not a two-phase process — it is a single ledger transaction. If that transaction fails, the deposit status remains `initiated` (it was not updated to completed). The admin can retry using the same idempotency key. The ledger's idempotency key ensures the transaction is not double-posted if the first attempt actually succeeded but the response was lost.

---

### Key Concepts — Chapter 7

- Distributed transactions cannot use traditional database transactions across multiple services. The Saga Pattern solves this.
- A Saga is a sequence of local transactions with defined compensating transactions for each step.
- Orchestrated Sagas use a central coordinator; choreographed Sagas react to events. Orchestration is used here for clarity and debuggability.
- The transfer saga state machine has explicit statuses for every stage including failure and reversal states.
- `REVERSAL_FAILED` is the most critical state — money is stranded and requires human intervention.
- Saga durability is achieved by persisting the state machine in the database; recovery on restart queries non-terminal transfers and resumes them.
- The daily transfer limit check uses a database-level atomic upsert to prevent race conditions.
- Deposits flow through a suspense account (two phases) except for admin credits which use a direct two-entry model.
- Both services require idempotency keys on all write operations to safely handle retries.

---

### Before You Continue — Chapter 7 Checklist

Before reading Chapter 8, make sure you can answer these:

1. Why cannot traditional database transactions solve the distributed money movement problem?
2. Describe the difference between orchestrated and choreographed Sagas. Why is orchestration chosen here?
3. Alice sends ₹500 to Bob. Phase 2 fails. Walk through exactly what happens next, including all ledger entries written during compensation.
4. What is `REVERSAL_FAILED`? Why is it a critical alert? What does a human operator need to do?
5. The Transfer Service restarts. It finds a transfer in `FUNDS_RESERVED` status. What does it do?
6. How does the daily transfer limit check prevent the race condition where two concurrent transfers both read the limit as not exceeded?
7. Why does the Deposit Service's callback handler always return `200` to the payment gateway, even if deposit processing fails internally?

---

## Chapter 8: Service Design — Approval Service, Notification Service, Audit Service & Scheduler Service

---

### 8.1 The Supporting Cast

The four services in this chapter do not move money directly. They support the services that do. This distinction is important because it defines their failure characteristics: if the Notification Service goes down, transfers still complete — users just receive their notifications late. If the Transfer Service goes down, nothing moves. Supporting services must be reliable, but their failures are not catastrophic to the financial core.

This does not mean they are unimportant. The Approval Service is a hard dependency for large transfers — without it, high-value transfers cannot proceed. The Audit Service provides the compliance and forensic record that regulated systems legally require. The Scheduler Service enables the scheduled transfer feature entirely. The Notification Service, while not a hard dependency, directly shapes user trust in the platform.

Each service is designed with this failure profile in mind: graceful degradation where possible, clear hard dependencies where not.

---

## Part A: The Approval Service

### 8.2 Purpose

The Approval Service manages the human approval workflow for sensitive operations. Its primary use case in this system is approving large transfers — those exceeding ₹1,00,000 — which require a Manager or Admin to explicitly approve or reject before the Transfer Service can proceed.

This service exists because certain financial operations carry enough risk that they should not execute without a human review step. Regulators expect this. Fraud vectors exploit the absence of it.

### 8.3 How the Approval Workflow Fits Into the Transfer Saga

From Chapter 7, you know that when a transfer requires approval, the Transfer Service pauses the saga and creates an approval request. The saga resumes only when it receives either `approval.approved` or `approval.rejected` from the Approval Service.

The Approval Service is therefore a **saga participant** — it holds the saga in a waiting state until a human decision is made. The Transfer Service is responsible for creating the approval request. The Approval Service is responsible for presenting it to a qualified approver and recording their decision.

The integration is designed so that the Approval Service knows nothing about the saga mechanics. It receives a request to approve or reject something, records the decision, and publishes an event. The Transfer Service's event consumer handles resuming the saga. This keeps the Approval Service generic — it could be used for approving account credits, KYC overrides, or any other sensitive action in the future, without modification.

### 8.4 Business Rules

- Only users with the `manager` or `admin` role can approve or reject approval requests.
- An approver cannot approve their own requests — if a manager initiated a large transfer, a different manager or an admin must approve it.
- Approval requests expire after 48 hours. An expired request is automatically rejected and the Transfer Service is notified via event. The transfer fails.
- An approval request can only be in one of four states: `pending`, `approved`, `rejected`, `expired`.
- Once a decision is made (approved or rejected), it cannot be reversed. A new transfer must be initiated if the original was rejected.
- The approver must provide a reason for rejections (optional for approvals).
- All approval decisions are recorded with the approver's identity and timestamp.

### 8.5 Approval Request State Machine

```
PENDING
  → APPROVED    (by Manager or Admin who is not the requester)
  → REJECTED    (by Manager or Admin who is not the requester, with reason)
  → EXPIRED     (by Scheduler Service job after 48 hours)

APPROVED      [terminal]
REJECTED      [terminal]
EXPIRED       [terminal]
```

### 8.6 API Endpoints

```
POST /api/v1/approvals
     Auth: Internal API key (Transfer Service only)
     Body: {
       requestType: "large_transfer",
       referenceId: string,       -- the transfer ID
       requestedBy: string,       -- user ID who initiated the transfer
       requestedByRole: string,
       amount: number,
       currency: string,
       sourceAccountId: string,
       destinationAccountId: string,
       description?: string,
       expiresAt: string          -- Transfer Service sets this (NOW + 48h)
     }
     Response 201: {
       approvalId: string,
       status: "pending",
       expiresAt: string
     }

GET  /api/v1/approvals
     Auth: Manager, Admin
     Query: ?status=pending&requestType=large_transfer&from=&to=
     Response 200: {
       approvals: [{
         id, requestType, referenceId, requestedBy, amount,
         currency, status, createdAt, expiresAt
       }],
       pagination: { nextCursor, hasMore }
     }

GET  /api/v1/approvals/:approvalId
     Auth: Manager, Admin, or the user who initiated the request
     Response 200: {
       id, requestType, referenceId, requestedBy, requestedByRole,
       amount, currency, sourceAccountId, destinationAccountId,
       description, status, approvedBy?, rejectedBy?,
       approverReason?, createdAt, decidedAt?, expiresAt
     }

POST /api/v1/approvals/:approvalId/approve
     Auth: Manager, Admin (not the requester)
     Body: { reason?: string }
     Response 200: {
       approvalId: string,
       status: "approved",
       decidedBy: string,
       decidedAt: string
     }
     Response 403: { error: "CANNOT_APPROVE_OWN_REQUEST" }
     Response 422: { error: "APPROVAL_NOT_PENDING" }
     Response 422: { error: "APPROVAL_EXPIRED" }

POST /api/v1/approvals/:approvalId/reject
     Auth: Manager, Admin (not the requester)
     Body: { reason: string }    -- reason is mandatory for rejections
     Response 200: {
       approvalId: string,
       status: "rejected",
       decidedBy: string,
       decidedAt: string,
       reason: string
     }
     Response 403: { error: "CANNOT_REJECT_OWN_REQUEST" }
     Response 422: { error: "APPROVAL_NOT_PENDING" }
```

### 8.7 Database Schema

```
Database: approval_db

Table: approval_requests
Purpose: The complete record of every approval request and its resolution.

Columns:
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
  request_type          VARCHAR(50) NOT NULL
                        CHECK (request_type IN
                        ('large_transfer','account_credit','kyc_override',
                        'account_unfreeze_override'))
                        -- extensible list as new sensitive operations are added
  reference_id          UUID NOT NULL
                        The ID of the thing being approved (e.g. transfer ID)
  reference_type        VARCHAR(50) NOT NULL
  requested_by          UUID NOT NULL    -- user ID of the initiator
  requested_by_role     VARCHAR(50) NOT NULL
  amount                BIGINT           -- relevant for financial approvals
  currency              CHAR(3)
  source_account_id     UUID
  destination_account_id UUID
  description           TEXT
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN
                        ('pending','approved','rejected','expired'))
  decided_by            UUID             -- user ID of approver/rejector
  decided_by_role       VARCHAR(50)
  approver_reason       TEXT
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  decided_at            TIMESTAMPTZ
  expires_at            TIMESTAMPTZ NOT NULL

Indexes:
  INDEX on status
  INDEX on requested_by
  INDEX on decided_by
  INDEX on reference_id
  INDEX on created_at
  INDEX on expires_at WHERE status = 'pending'
  -- last index is used by the expiry job to find pending requests efficiently
```

### 8.8 Events Published

```typescript
// approval.created
{
  eventType: "approval.created",
  payload: {
    approvalId: string,
    requestType: string,
    referenceId: string,
    requestedBy: string,
    amount?: number,
    currency?: string,
    expiresAt: string,
    occurredAt: string
  }
}

// approval.approved
{
  eventType: "approval.approved",
  payload: {
    approvalId: string,
    requestType: string,
    referenceId: string,     -- transfer ID, used by Transfer Service to resume saga
    decidedBy: string,
    decidedByRole: string,
    reason?: string,
    occurredAt: string
  }
}

// approval.rejected
{
  eventType: "approval.rejected",
  payload: {
    approvalId: string,
    requestType: string,
    referenceId: string,
    decidedBy: string,
    decidedByRole: string,
    reason: string,
    occurredAt: string
  }
}

// approval.expired
{
  eventType: "approval.expired",
  payload: {
    approvalId: string,
    requestType: string,
    referenceId: string,
    requestedBy: string,
    expiredAt: string,
    occurredAt: string
  }
}
```

### 8.9 Events Consumed

```
schedule.approval_expiry_check (from Scheduler Service)
  → Runs every 15 minutes. The Approval Service queries for all
    pending approval requests where expires_at < NOW().
  → For each expired request: update status to 'expired',
    publish approval.expired event.
  → Idempotency: the status update uses a WHERE status = 'pending'
    clause, so already-expired records are safely skipped.
```

### 8.10 Failure Scenarios

**The approver submits a decision but the database write fails.** The request remains `pending`. The approver can resubmit. The endpoint is idempotent only for the same decision: approving an already-approved request returns the existing decision. Attempting to reject an already-approved request returns `422 APPROVAL_NOT_PENDING`.

**The `approval.approved` event is published but the Transfer Service never receives it.** The Transfer Service's RabbitMQ consumer will process it from the queue when connectivity is restored. In the meantime, the transfer remains in `PENDING_APPROVAL` status. The user can view the transfer status — it shows "pending approval" — and can see the approval has been granted in the approvals view. When the event is eventually delivered, the saga resumes.

**The Approval Service is down when the Transfer Service needs to create an approval request.** The Transfer Service's call to `POST /api/v1/approvals` will fail. The transfer remains in `PENDING_APPROVAL` status without an `approvalId`. The recovery service, on the next cycle, detects a transfer in `PENDING_APPROVAL` with no `approvalId` and retries the approval creation call.

---

## Part B: The Notification Service

### 8.11 Purpose

The Notification Service is responsible for telling users what happened. It is purely reactive — it consumes events from other services and translates them into human-readable messages delivered through appropriate channels.

This service is a textbook example of why asynchronous event-driven communication is powerful. The Transfer Service does not know or care how notifications work. It publishes `transfer.completed`. The Notification Service, independently, decides what that means for the user, which channel to use, and how to format the message. The two services evolve completely independently.

### 8.12 Responsibilities

- Consuming financial and system events and generating user-facing notifications
- Delivering notifications via email, SMS, and in-app channels
- Respecting user notification preferences (do not notify if the user has disabled a channel)
- Tracking delivery status of every notification
- Handling delivery failures with retry logic
- Providing a notification history for the user-facing dashboard

### 8.13 Channel Priority and Fallback

Not every event warrants every channel. The Notification Service applies a channel matrix:

```
Event                     | Email | SMS | In-App
--------------------------|-------|-----|-------
transfer.completed        |  ✓    |  ✓  |   ✓
transfer.failed           |  ✓    |  ✓  |   ✓
transfer.reversed         |  ✓    |  ✓  |   ✓
deposit.completed         |  ✓    |  ✓  |   ✓
account.frozen            |  ✓    |  ✓  |   ✓
account.unfrozen          |  ✓    |     |   ✓
approval.created          |  ✓    |     |   ✓  (to approvers)
approval.approved         |  ✓    |     |   ✓  (to requester)
approval.rejected         |  ✓    |  ✓  |   ✓  (to requester)
user.logged_in            |       |     |   ✓
user.password_changed     |  ✓    |  ✓  |   ✓
schedule.created          |  ✓    |     |   ✓
schedule.executed         |       |     |   ✓
```

If a user has disabled a channel, the Notification Service skips it. If delivery fails on a channel, the service retries that channel independently — a failed SMS does not prevent a successful email delivery.

### 8.14 Notification Templating

Each notification type has a template. Templates are stored in the service's configuration and support variable interpolation. For example, the transfer completion template:

```
Subject: Your transfer of ₹{amount} has been completed

Hi {firstName},

Your transfer of ₹{amount} to account ending in {lastFourDigits}
has been successfully completed.

Transfer Reference: {transferId}
Date & Time: {completedAt}

If you did not initiate this transfer, please contact support
immediately at support@fintech.example.

The Fintech Team
```

Variables are populated from the event payload. The Notification Service is responsible for looking up any additional data it needs — for example, the user's first name and email address, which it retrieves from its own local copy of user data (maintained by consuming `user.registered` and `user.profile_updated` events).

This local copy is important: the Notification Service does not call the User Service on every notification. Calling a synchronous service inside an event consumer creates a dependency that can cause failures. Instead, the Notification Service maintains a lightweight local cache of the user data it needs (first name, email, phone, preferences), kept up to date via events.

### 8.15 Database Schema

```
Database: notification_db

Table: notification_templates
Purpose: Stores templates for each notification type and channel.

Columns:
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
  event_type    VARCHAR(100) NOT NULL    -- e.g. 'transfer.completed'
  channel       VARCHAR(20) NOT NULL     -- 'email', 'sms', 'in_app'
  subject       VARCHAR(255)             -- email only
  body_template TEXT NOT NULL
  is_active     BOOLEAN NOT NULL DEFAULT true
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()

Constraints:
  UNIQUE (event_type, channel)

Indexes:
  UNIQUE INDEX on (event_type, channel)
  INDEX on is_active
```

```
Table: notifications
Purpose: A record of every notification sent or attempted.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  user_id         UUID NOT NULL
  event_id        UUID NOT NULL UNIQUE
                  The eventId from the event envelope. Used for idempotency:
                  one notification per event per user.
  event_type      VARCHAR(100) NOT NULL
  channel         VARCHAR(20) NOT NULL
  recipient       VARCHAR(255) NOT NULL   -- email address or phone number
  subject         VARCHAR(255)
  body            TEXT NOT NULL
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','skipped'))
  failure_reason  TEXT
  attempt_count   INTEGER NOT NULL DEFAULT 0
  sent_at         TIMESTAMPTZ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  UNIQUE INDEX on (event_id, channel)    -- idempotency
  INDEX on user_id
  INDEX on status
  INDEX on created_at
  INDEX on (status, attempt_count) WHERE status = 'failed'
  -- last index for retry job
```

```
Table: user_notification_cache
Purpose: Local cache of user contact information and preferences.
         Updated by consuming user events. Eliminates need to call
         User Service during notification processing.

Columns:
  user_id           UUID PRIMARY KEY
  first_name        VARCHAR(100) NOT NULL
  email             VARCHAR(255) NOT NULL
  phone_number      VARCHAR(20)
  email_enabled     BOOLEAN NOT NULL DEFAULT true
  sms_enabled       BOOLEAN NOT NULL DEFAULT true
  in_app_enabled    BOOLEAN NOT NULL DEFAULT true
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  No additional indexes needed — all queries are by user_id (PK)
```

### 8.16 Events Consumed

```
transfer.completed     → Notify source and destination account owners
transfer.failed        → Notify source account owner
transfer.reversed      → Notify source account owner
deposit.completed      → Notify destination account owner
account.frozen         → Notify account owner (urgent — use all channels)
account.unfrozen       → Notify account owner
approval.approved      → Notify the transfer initiator
approval.rejected      → Notify the transfer initiator (with reason)
approval.created       → Notify all Managers and Admins (pending review)
user.registered        → Store in user_notification_cache (no notification sent)
user.profile_updated   → Update user_notification_cache
user.password_changed  → Notify user (security alert)
user.logged_in         → Update last login cache; no notification unless
                         login from new device/location (future feature)
schedule.created       → Notify user of scheduled transfer confirmation
schedule.executed      → Notify user when scheduled transfer runs
schedule.failed        → Notify user if scheduled transfer failed
```

### 8.17 Handling the `approval.created` Event for Manager Notification

When a large transfer needs approval, all active managers and admins should be notified. The Notification Service does not know who the managers are — it only has a cache of users it has already seen. 

The solution: the Notification Service maintains a separate `manager_recipients` cache, populated by consuming `user.registered` events where the role is `manager` or `admin`, and updated when roles change via `user.role_changed` events. When `approval.created` arrives, the service queries this cache and sends a notification to every active manager and admin.

### 8.18 Events Published

```typescript
// notification.sent
{
  eventType: "notification.sent",
  payload: {
    notificationId: string,
    userId: string,
    eventType: string,
    channel: string,
    occurredAt: string
  }
}

// notification.failed
{
  eventType: "notification.failed",
  payload: {
    notificationId: string,
    userId: string,
    eventType: string,
    channel: string,
    reason: string,
    attemptCount: number,
    occurredAt: string
  }
}
```

### 8.19 Failure Scenarios

**Email provider is unavailable.** The notification record is created with status `pending`. The retry job (runs every 5 minutes) picks up all `failed` or `pending` notifications that have been attempted fewer than 5 times and retries them. After 5 attempts, the notification is marked `failed` permanently and a `notification.failed` event is published.

**The Notification Service is down for 2 hours.** Events have been accumulating in RabbitMQ queues during the outage. When the service restarts, it processes the backlog. Users receive delayed notifications. No notifications are lost. The order of delivery may not match the order of events if multiple consumers process in parallel, but for notification purposes this is acceptable.

**A notification is delivered twice due to a duplicate event.** The `UNIQUE INDEX on (event_id, channel)` in the notifications table prevents creating a duplicate record. The second attempt to insert fails silently. One notification is sent.

---

## Part C: The Audit Service

### 8.20 Purpose

The Audit Service maintains an **immutable, tamper-evident log** of every significant event that occurs in the system. It exists for three reasons: regulatory compliance (financial systems are required to maintain audit trails), security forensics (investigating incidents or fraud), and operational transparency (understanding what happened and when).

Every other service writes to its own database. The Audit Service writes to a separate audit database that no other service can write to. The audit log is append-only. It is never updated. It is never deleted. It is the judicial record of the system.

### 8.21 What Gets Audited

The Audit Service consumes events from all other services and transforms them into audit log entries. Additionally, services can directly publish `audit.event` messages for actions that do not have their own domain events but must be audited.

The categories of audited actions:

**Financial operations**: every transfer (request, completion, failure, reversal), every deposit, every ledger transaction posting.

**Account operations**: account creation, freezing, unfreezing, closure, status changes.

**Authentication events**: logins, logouts, failed login attempts, password changes, session revocations.

**Administrative actions**: admin credits, role changes, KYC approvals and rejections, system configuration changes.

**Access events**: every time a support agent or admin views a customer's account or transaction history.

**System events**: service starts and stops, reconciliation results, DLQ alerts.

### 8.22 Immutability Guarantees

Like the Ledger Service's entries, audit log records must be immutable. This is enforced at multiple levels:

**Application level**: The Audit Service exposes no endpoint to update or delete records. The codebase has no repository method for UPDATE or DELETE on audit records.

**Database level**: The audit database application user is granted only INSERT and SELECT permissions on the audit log table. Even if a bug introduced an UPDATE statement, the database would reject it.

**Table-level constraint**: A PostgreSQL rule or trigger can be added to explicitly reject any UPDATE or DELETE on the audit log table, regardless of the database user's permissions.

**Append-only storage consideration**: For advanced implementations, the audit database can be stored on append-only storage media or replicated to an immutable object store (like AWS S3 with Object Lock) for additional tamper protection.

### 8.23 Database Schema

```
Database: audit_db

Table: audit_logs
Purpose: The immutable record of every significant system event.
         INSERT only. No UPDATE. No DELETE.

Columns:
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
  event_id            UUID NOT NULL UNIQUE
                      The eventId from the originating event envelope.
                      Ensures one audit record per event.
  event_type          VARCHAR(100) NOT NULL
  actor_id            UUID             -- user ID who performed the action
                                       -- NULL for system-initiated events
  actor_role          VARCHAR(50)
  actor_ip            INET
  target_resource     VARCHAR(100)     -- e.g. 'account', 'transfer', 'user'
  target_resource_id  UUID
  action              VARCHAR(100) NOT NULL
                      Human-readable action description
  outcome             VARCHAR(20) NOT NULL
                      CHECK (outcome IN ('success','failure','pending'))
  metadata            JSONB
                      All relevant contextual data. Rich but sanitised
                      (no passwords, no full card numbers, etc.)
  correlation_id      UUID NOT NULL
                      From the event envelope. Allows tracing full request.
  service_name        VARCHAR(100) NOT NULL
                      Which service produced this audit event.
  occurred_at         TIMESTAMPTZ NOT NULL
                      From the event envelope (when the event occurred,
                      not when the audit record was written).
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
                      When the audit record was written to this database.

Indexes:
  UNIQUE INDEX on event_id           -- idempotency
  INDEX on actor_id
  INDEX on target_resource_id
  INDEX on (target_resource, target_resource_id)
  INDEX on event_type
  INDEX on correlation_id            -- trace a full request
  INDEX on occurred_at               -- time-range audit queries
  INDEX on actor_id WHERE actor_id IS NOT NULL
  INDEX on service_name
```

```
Table: audit_log_access
Purpose: Meta-audit: records every time someone queries the audit log itself.
         An auditor viewing audit records must themselves be audited.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  accessor_id     UUID NOT NULL    -- who ran the audit query
  accessor_role   VARCHAR(50) NOT NULL
  query_params    JSONB NOT NULL   -- what filters were applied
  result_count    INTEGER
  accessed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on accessor_id
  INDEX on accessed_at
```

### 8.24 Events Consumed

The Audit Service consumes events from every other service. Rather than list each event individually, here is the pattern: the Audit Service binds its queue to every exchange with the pattern `#` — meaning it receives every event published by every service. It then maps each event type to an audit action.

Key mappings:

```
transfer.requested      → action: "Transfer initiated",        outcome: pending
transfer.completed      → action: "Transfer completed",        outcome: success
transfer.failed         → action: "Transfer failed",           outcome: failure
transfer.reversed       → action: "Transfer reversed",         outcome: success
transfer.reversal_failed → action: "Transfer reversal failed", outcome: failure
                           severity: CRITICAL

deposit.completed       → action: "Deposit credited",          outcome: success
deposit.admin_credit_applied → action: "Admin credit applied", outcome: success
                               enhanced_audit: true

account.created         → action: "Account created",           outcome: success
account.frozen          → action: "Account frozen",            outcome: success
account.unfrozen        → action: "Account unfrozen",          outcome: success

approval.approved       → action: "Transfer approved",         outcome: success
approval.rejected       → action: "Transfer rejected",         outcome: failure

user.logged_in          → action: "User login",                outcome: success
user.password_changed   → action: "Password changed",          outcome: success
user.suspended          → action: "User suspended",            outcome: success

ledger.reconciliation.failed → action: "Reconciliation failure", outcome: failure
                               severity: CRITICAL
```

### 8.25 API Endpoints

```
GET  /api/v1/audit/logs
     Auth: Auditor, Admin
     Query: ?actorId=&targetResourceId=&eventType=&from=&to=
            &correlationId=&outcome=&limit=&cursor=
     Response 200: {
       logs: [{
         id, eventType, actorId, actorRole, targetResource,
         targetResourceId, action, outcome, metadata,
         correlationId, serviceName, occurredAt
       }],
       pagination: { nextCursor, hasMore }
     }
     Note: This query is logged in audit_log_access.

GET  /api/v1/audit/logs/:logId
     Auth: Auditor, Admin
     Response 200: { full audit log record }
     Note: This access is logged in audit_log_access.

GET  /api/v1/audit/logs/correlation/:correlationId
     Auth: Auditor, Admin
     Purpose: Retrieve all audit events for a single user action
             (the complete journey of one request).
     Response 200: {
       correlationId: string,
       events: [ ...ordered by occurred_at ]
     }

GET  /api/v1/audit/summary
     Auth: Admin
     Query: ?from=&to=
     Response 200: {
       totalEvents: number,
       byOutcome: { success: number, failure: number, pending: number },
       byEventType: { [eventType: string]: number },
       criticalFailures: number
     }
```

### 8.26 Scaling Considerations for the Audit Service

The Audit Service writes continuously — every event in the system generates at least one audit record. Under high load, this is a significant write volume. Several strategies address this:

**Batch inserts**: Rather than inserting one audit record per event, the consumer batches events and performs bulk inserts. A batch of 100 inserts is far more efficient than 100 individual inserts.

**Table partitioning**: The `audit_logs` table is partitioned by `occurred_at` on a monthly basis. Queries scoped to a time range scan only the relevant partition(s).

**Separate read replica**: Audit queries (from Auditors browsing logs) run against a read replica, not the primary database. This prevents audit queries from impacting the write throughput.

**Retention policy**: Audit logs older than seven years can be archived to cold storage (not deleted). The active database maintains only seven years of records. Archived records remain queryable but with higher latency.

---

## Part D: The Scheduler Service

### 8.27 Purpose

The Scheduler Service executes time-based tasks. Its primary role in this system is processing **scheduled transfers** — transfers that a user has set to execute at a future date and time. It also runs system maintenance tasks like balance snapshot recalculation, approval expiry checks, and saga recovery triggers.

Think of it as a reliable `cron` that runs inside your distributed system, aware of your business domain, and integrated with your event infrastructure.

### 8.28 The Challenge of Distributed Scheduling

A naive implementation might use Node.js `setInterval` or `node-cron` inside the Transfer Service itself. This has a critical flaw: if you run three instances of the Transfer Service (as you would in production), all three instances would trigger the same scheduled transfer simultaneously. The transfer would execute three times.

The Scheduler Service solves this by centralising scheduling into a single service and using **distributed locking** to ensure that even if multiple instances of the Scheduler Service are running (for high availability), each scheduled task is executed exactly once.

The distributed lock is implemented using Redis. When a Scheduler instance is about to execute a task, it attempts to acquire a Redis lock with the task's ID as the key and a short TTL (slightly longer than the expected execution time). Only the instance that successfully acquires the lock executes the task. Other instances see the lock is held and skip that task.

### 8.29 Task Types

```
Scheduled User Tasks:
  scheduled_transfer      — Execute a transfer at a specified datetime

System Maintenance Tasks:
  balance_snapshot        — Recalculate ledger balance snapshots (nightly, 2am)
  approval_expiry_check   — Expire overdue approvals (every 15 minutes)
  saga_recovery           — Find and resume interrupted sagas (every minute)
  daily_limit_reset       — Archive yesterday's daily transfer totals (midnight)
  dlq_alert               — Check DLQ depths and alert if non-empty (every 5 minutes)
  reconciliation          — Run ledger reconciliation check (every hour)
  notification_retry      — Retry failed notifications (every 5 minutes)
  session_cleanup         — Remove expired sessions from Auth DB (nightly, 3am)
```

### 8.30 Business Rules for Scheduled Transfers

- A scheduled transfer is created with all the same validation rules as an immediate transfer (account validation, limit checks, KYC check). These are checked at scheduling time, not at execution time.
- The scheduled datetime must be at least 5 minutes in the future (to prevent abuse of scheduling as a way to bypass rate limiting).
- The maximum scheduling window is 90 days in the future.
- A user can cancel a scheduled transfer before it executes, as long as it has not yet entered processing.
- When a scheduled transfer is due, the Scheduler Service publishes a `schedule.transfer_due` event. The Transfer Service consumes this and initiates the transfer saga. If the transfer fails at execution time (account has been frozen, insufficient funds due to other transfers), the user is notified and the scheduled transfer is marked as failed.
- A scheduled transfer does not lock the funds at the time of scheduling. This is a design trade-off: locking funds would give stronger guarantees but is operationally complex. The user is informed that the scheduled transfer may fail if funds are unavailable at execution time.

### 8.31 API Endpoints

```
POST /api/v1/schedules
     Auth: Customer (account owner)
     Body: {
       sourceAccountId: string,
       destinationAccountId: string,
       amount: number,
       currency: "INR",
       description?: string,
       scheduledAt: string,        -- ISO 8601 datetime
       recurrence?: {              -- future feature, design for extensibility
         type: "none"              -- only "none" supported in V1
       }
     }
     Response 201: {
       scheduleId: string,
       status: "scheduled",
       scheduledAt: string,
       transferPreviewAmount: number
     }
     Response 422: { error: "SCHEDULED_TIME_TOO_SOON" }
     Response 422: { error: "SCHEDULED_TIME_TOO_FAR" }

GET  /api/v1/schedules
     Auth: Customer (own), Admin
     Query: ?accountId=&status=&from=&to=
     Response 200: {
       schedules: [{
         id, sourceAccountId, destinationAccountId, amount,
         currency, scheduledAt, status, createdAt
       }],
       pagination: { nextCursor, hasMore }
     }

GET  /api/v1/schedules/:scheduleId
     Auth: Owner, Admin
     Response 200: { full schedule record }

DELETE /api/v1/schedules/:scheduleId
     Auth: Owner (before execution), Admin (anytime)
     Response 200: { message: "Scheduled transfer cancelled." }
     Response 422: { error: "SCHEDULE_ALREADY_EXECUTED" }
     Response 422: { error: "SCHEDULE_ALREADY_PROCESSING" }
```

### 8.32 Database Schema

```
Database: scheduler_db

Table: scheduled_tasks
Purpose: Every scheduled task — both user-initiated and system-initiated.

Columns:
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  task_type       VARCHAR(50) NOT NULL
                  CHECK (task_type IN (
                    'scheduled_transfer', 'balance_snapshot',
                    'approval_expiry_check', 'saga_recovery',
                    'daily_limit_reset', 'dlq_alert',
                    'reconciliation', 'notification_retry', 'session_cleanup'
                  ))
  reference_id    UUID             -- for scheduled_transfer: the transfer record
  reference_type  VARCHAR(50)
  payload         JSONB            -- task-specific data
  status          VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN
                  ('scheduled','processing','completed','failed','cancelled'))
  scheduled_at    TIMESTAMPTZ NOT NULL
  locked_at       TIMESTAMPTZ      -- when a Scheduler instance acquired the lock
  locked_by       VARCHAR(255)     -- which Scheduler instance holds the lock
  executed_at     TIMESTAMPTZ
  completed_at    TIMESTAMPTZ
  failed_at       TIMESTAMPTZ
  failure_reason  TEXT
  attempt_count   INTEGER NOT NULL DEFAULT 0
  max_attempts    INTEGER NOT NULL DEFAULT 3
  created_by      UUID             -- user ID for user-initiated tasks; NULL for system
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

Indexes:
  INDEX on task_type
  INDEX on status
  INDEX on scheduled_at
  INDEX on (status, scheduled_at) WHERE status = 'scheduled'
  -- critical index: "find all tasks due for execution right now"
  INDEX on created_by WHERE created_by IS NOT NULL
  INDEX on reference_id WHERE reference_id IS NOT NULL
```

### 8.33 The Scheduling Loop

The Scheduler Service runs a polling loop every 30 seconds:

```
Every 30 seconds:
  1. Query for tasks WHERE status = 'scheduled' AND scheduled_at <= NOW()
  2. For each due task:
     a. Attempt to acquire Redis distributed lock (key: task_id, TTL: 5 minutes)
     b. If lock acquired:
        → Update task status to 'processing', set locked_at and locked_by
        → Execute the task (publish event or call internal API)
        → On success: update status to 'completed', set completed_at
        → On failure: increment attempt_count
          - If attempt_count < max_attempts: reset to 'scheduled',
            set scheduled_at = NOW() + backoff_delay
          - If attempt_count >= max_attempts: set status to 'failed',
            publish schedule.failed event
        → Release Redis lock
     c. If lock not acquired: skip (another instance is handling it)
  3. Sleep 30 seconds, repeat
```

### 8.34 Events Published

```typescript
// schedule.created
{
  eventType: "schedule.created",
  payload: {
    scheduleId: string,
    taskType: string,
    referenceId?: string,
    scheduledAt: string,
    createdBy?: string,
    occurredAt: string
  }
}

// schedule.transfer_due — triggers Transfer Service saga
{
  eventType: "schedule.transfer_due",
  payload: {
    scheduleId: string,
    transferId: string,       -- the pre-created transfer record ID
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    currency: string,
    occurredAt: string
  }
}

// schedule.executed — task ran successfully
{
  eventType: "schedule.executed",
  payload: {
    scheduleId: string,
    taskType: string,
    referenceId?: string,
    executedAt: string,
    occurredAt: string
  }
}

// schedule.failed — task exhausted all retries
{
  eventType: "schedule.failed",
  payload: {
    scheduleId: string,
    taskType: string,
    referenceId?: string,
    attemptCount: number,
    failureReason: string,
    requiresAttention: boolean,
    occurredAt: string
  }
}

// schedule.cancelled
{
  eventType: "schedule.cancelled",
  payload: {
    scheduleId: string,
    cancelledBy: string,
    occurredAt: string
  }
}

// schedule.approval_expiry_check — triggers Approval Service expiry logic
{
  eventType: "schedule.approval_expiry_check",
  payload: {
    triggeredAt: string
  }
}

// schedule.reconciliation_due — triggers Ledger Service reconciliation
{
  eventType: "schedule.reconciliation_due",
  payload: {
    triggeredAt: string
  }
}
```

### 8.35 Failure Scenarios

**A scheduled transfer fires but the Transfer Service is unavailable.** The Scheduler Service publishes the `schedule.transfer_due` event to RabbitMQ. The Transfer Service's consumer queue holds the message. When the Transfer Service recovers, it processes the message from the queue. The transfer executes late — the user's transfer arrives after the scheduled time, but it arrives. The Scheduler task is marked `completed` because the event was published successfully, not because the transfer was completed.

**A Scheduler instance crashes while holding a distributed lock.** The Redis lock has a TTL of 5 minutes. After 5 minutes, the lock expires. Another Scheduler instance acquires the lock and executes the task. The crashed instance's task record is in `processing` status with a `locked_at` timestamp more than 5 minutes old — this is detected as a stale lock. The recovery logic resets such records to `scheduled`.

**Two Scheduler instances try to acquire the same lock simultaneously.** Redis's `SET NX` (set if not exists) command is atomic. Exactly one instance will succeed. The other will see the lock is already held and skip the task. This is safe.

---

### Key Concepts — Chapter 8

- The Approval Service pauses the transfer saga, holding it in `PENDING_APPROVAL` until a human decides.
- Approvers cannot approve their own requests — a self-approval guard is enforced at the application level.
- The Notification Service is purely reactive — it consumes events and translates them into user messages.
- The Notification Service maintains a local cache of user contact data to avoid synchronous calls during event processing.
- The Audit Service receives every event via a wildcard binding and writes immutable records to an append-only database.
- Audit log immutability is enforced at both application and database permission levels.
- The Scheduler Service uses Redis distributed locking to ensure each scheduled task executes exactly once, even across multiple service instances.
- Scheduled transfers do not lock funds at scheduling time — they may fail at execution time if conditions change.
- System maintenance tasks (balance snapshots, saga recovery, approval expiry) are managed by the Scheduler Service, keeping those concerns out of the business services.

---

### Before You Continue — Chapter 8 Checklist

Before reading Chapter 9, make sure you can answer these:

1. A manager tries to approve their own large transfer. Trace the request and explain where and how it is rejected.
2. The Notification Service is down for three hours during which ten transfers complete. What happens to those notifications? Are any lost?
3. Why does the Notification Service maintain a local cache of user data rather than calling the User Service during event processing?
4. Why are audit logs stored in a separate database with restricted permissions, rather than just in a table in one of the existing service databases?
5. Two instances of the Scheduler Service start simultaneously and both find a scheduled transfer due for execution. Walk through exactly what happens using the Redis lock mechanism.
6. A scheduled transfer fires but the user's account has been frozen since the transfer was scheduled. What happens?
7. Why does the Scheduler Service mark a task as `completed` when it publishes the event, rather than waiting for the transfer to complete?

---

## Chapter 9: Database Design, TypeScript Architecture & The Shared Packages System

---

### 9.1 Why This Chapter Exists as Its Own Chapter

Chapters 5 through 8 designed each service individually. Each service chapter included its own database schema. You have now seen all thirteen schemas in context. This chapter steps back and examines the complete database design as a unified whole — the patterns, constraints, and decisions that apply consistently across every service, and why they are designed as they are.

Then it turns to the TypeScript architecture: how types, interfaces, and domain models are organised across the monorepo so that every service speaks the same language when communicating. This is the connective tissue of the entire codebase.

Finally, it examines the shared packages in detail — the libraries that every service depends on and that encode cross-cutting concerns like error handling, middleware, messaging, and configuration validation.

Getting these foundations right before writing service code is one of the highest-leverage investments you will make in this project. A poorly designed type system or a weak shared package structure creates friction that compounds across every service you build.

---

## Part A: Complete Database Design

### 9.2 The Database-Per-Service Principle in Practice

You established in Chapter 2 that each service owns its own database. Now that all services have been designed, here is the complete inventory of databases in this system and their purposes:

```
Database Name    Owner Service         Primary Concern
─────────────────────────────────────────────────────────────────────
auth_db          Auth Service          Credentials, sessions, tokens
user_db          User Service          Profiles, KYC, preferences
account_db       Account Service       Account ownership and status
ledger_db        Ledger Service        Double-entry accounting records
transfer_db      Transfer Service      Transfer sagas and state machines
deposit_db       Deposit Service       Deposit lifecycle
approval_db      Approval Service      Approval requests and decisions
notification_db  Notification Service  Notification records and cache
audit_db         Audit Service         Immutable event audit log
scheduler_db     Scheduler Service     Scheduled tasks
```

Ten databases. No service reads from another service's database. This constraint is what allows each service to evolve its schema independently. If the Ledger Service needs to add a new column to `ledger_entries`, no other service is affected — no other service touches that table.

The cost of this constraint is **data duplication**. The Notification Service maintains a copy of user contact data. The Transfer Service stores account IDs that it retrieved from the Account Service. The Audit Service records actor names and roles that the Auth Service owns authoritatively. This duplication is intentional and accepted. In distributed systems, the choice between consistency and autonomy is a fundamental trade-off. This system chooses autonomy — each service is independent — and accepts that local copies of data may be slightly stale.

When you see data duplicated across services, the right question is not "why is this duplicated?" but "what event keeps this copy up to date, and what is the acceptable staleness window?"

---

### 9.3 Universal Database Design Patterns

Every database in this system follows a set of universal patterns. These are not optional style choices. They are structural requirements that enable consistency, auditability, and safe operation.

#### Pattern 1: UUID Primary Keys

Every table in every database uses a UUID as its primary key, generated by PostgreSQL's `gen_random_uuid()` function.

Why not auto-incrementing integers? Sequential integers leak information — an external caller can infer the total number of records, predict future IDs, and enumerate resources. UUID primary keys are opaque. A user who receives their account ID `acc-f4a2c1...` cannot guess any other account's ID.

Why generate UUIDs in PostgreSQL rather than in application code? Database-generated UUIDs ensure that the ID is always present in the inserted record, even when the application layer has bugs. It also simplifies bulk inserts.

The UUID type in PostgreSQL stores 128 bits efficiently (16 bytes) compared to a VARCHAR representation (36 bytes). Always declare UUID columns as `UUID` type, not `VARCHAR(36)`.

#### Pattern 2: Immutable Timestamps

Every table has `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Tables whose records change over time also have `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

`TIMESTAMPTZ` stores timestamps with timezone information, preserving the exact moment in time regardless of the database server's local timezone setting. Always use `TIMESTAMPTZ`, never `TIMESTAMP` (which is timezone-naive and causes subtle bugs when servers are in different timezones).

`updated_at` should be automatically maintained by a PostgreSQL trigger or by the application layer on every UPDATE. It should never be trusted as the exact time of the last change for audit purposes — that is what the Audit Service is for. `updated_at` is for operational convenience (cache invalidation, debugging).

#### Pattern 3: Soft Deletes

Records in most tables are never hard-deleted. Instead, a `deleted_at TIMESTAMPTZ` column is set to the current timestamp when a record is "deleted." All queries filter out soft-deleted records by adding `WHERE deleted_at IS NULL` to their conditions.

Why soft deletes? Financial records have regulatory retention requirements. A user who closes their account cannot have their transaction history deleted. Their profile must be retained for seven years for anti-money-laundering compliance. Soft deletes allow the data to be retained while being invisible to normal queries.

The pattern has a performance implication: every query that should exclude deleted records must include `WHERE deleted_at IS NULL`. A **partial index** on `deleted_at` makes this efficient:

```sql
CREATE INDEX idx_accounts_active
ON accounts(owner_id, created_at)
WHERE deleted_at IS NULL;
```

This index only includes non-deleted rows, so it is smaller and faster than a full-table index.

#### Pattern 4: Status as a Constrained Enum

Every status column uses a `CHECK` constraint that restricts values to a known set. Never store statuses as free-text strings without constraints — a typo in application code could write `"compelted"` instead of `"completed"` and the database would accept it silently.

```sql
status VARCHAR(30) NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'completed', 'failed', 'reversed'))
```

In PostgreSQL, you can also use proper `ENUM` types. The trade-off: `ENUM` types are faster and more space-efficient but harder to extend (adding a new value requires a schema migration). `VARCHAR` with `CHECK` constraints are easier to extend (modify the constraint) but slightly less efficient. For this system, `VARCHAR` with `CHECK` is preferred because the status values of sagas and workflows are expected to evolve.

#### Pattern 5: Amount Storage in Paise

Every monetary amount column is stored as `BIGINT` in paise (the smallest Indian currency denomination — 1/100 of a rupee). Never use `DECIMAL`, `NUMERIC`, or `FLOAT` for monetary amounts in the database.

`BIGINT` is a 64-bit integer, giving you a maximum value of 9,223,372,036,854,775,807 paise — approximately ₹92 trillion. That is sufficient headroom.

The constraint `CHECK (amount > 0)` ensures no zero or negative amounts are stored. Negative value in a double-entry system is represented by entry direction (debit vs credit), not by a negative number.

#### Pattern 6: Foreign Key Discipline

Within a single service's database, use foreign keys between related tables. Foreign keys enforce referential integrity — you cannot have a `ledger_entries` record pointing to a non-existent `ledger_transactions` record.

Between different services' databases, never use foreign keys. You cannot create a foreign key relationship across two separate database instances. Instead, you enforce cross-service referential integrity through application logic and event-driven consistency. This is one of the accepted costs of the database-per-service pattern.

Document cross-service references clearly in your schema with comments:

```sql
owner_id UUID NOT NULL
-- References users.id in auth_db via Auth Service.
-- Not a foreign key (different database). Validated at account creation time.
```

#### Pattern 7: JSONB for Flexible Metadata

Most tables include a `metadata JSONB` column. JSONB is PostgreSQL's binary JSON type — it stores JSON efficiently and supports rich querying with GIN indexes.

The `metadata` column holds contextual data that does not fit into the table's fixed columns and does not need to be queried often. For example, a transfer's `metadata` might include the user's device information at the time of the transfer, the IP address, and the UI version. This data is useful for fraud analysis but does not need its own column.

The rule: **if you filter or sort by a field regularly, give it a dedicated column**. If you only read it occasionally as context, put it in `metadata`.

---

### 9.4 Index Design Philosophy

Indexes make reads faster but writes slower. Every index adds overhead to INSERT and UPDATE operations because the index must be updated alongside the table. This means you should not index every column — only index columns that appear in frequently-executed queries' WHERE, ORDER BY, or JOIN clauses.

The most important query patterns for each service, and their corresponding indexes:

**Auth Service — most critical query:**
"Find user by email during login." → `UNIQUE INDEX on users(email)`

**Account Service — most critical queries:**
"Find all accounts for a user." → `INDEX on accounts(owner_id)`
"Find account by account number." → `UNIQUE INDEX on accounts(account_number)`

**Ledger Service — most critical query:**
"Find all entries for an account since a date." → `INDEX on ledger_entries(account_id, created_at)`
This is a composite index. The query `WHERE account_id = $1 AND created_at > $2` uses both columns, so the composite index is more efficient than two separate single-column indexes.

**Transfer Service — most critical queries:**
"Find in-flight sagas for recovery." → `INDEX on transfers(status) WHERE status NOT IN ('completed','failed','reversed')`
This is a partial index — it only indexes non-terminal transfers, making it small and fast.

**Scheduler Service — most critical query:**
"Find tasks due for execution." → `INDEX on scheduled_tasks(status, scheduled_at) WHERE status = 'scheduled'`
Again a partial index — only indexes scheduled (not yet executed) tasks.

**Audit Service — most critical queries:**
"Find all audit events for a correlation ID." → `INDEX on audit_logs(correlation_id)`
"Find all audit events for a resource." → `INDEX on audit_logs(target_resource, target_resource_id)`

---

### 9.5 Migration Strategy

Database schema migrations are managed using numbered SQL files. Each migration file is named with a sequential number and a descriptive name:

```
001_create_users.sql
002_create_sessions.sql
003_create_email_verification_tokens.sql
004_add_failed_login_tracking_to_users.sql
005_create_password_reset_tokens.sql
```

The critical rules for migrations:

**Once applied, a migration is never modified.** If migration `004` was applied to a database and you discover a mistake in it, you write migration `006` to correct it. You never edit `004`. Editing an applied migration means the database's actual state no longer matches what the migration file says — this causes confusion and failures in other environments.

**Migrations are forward-only in normal operation.** You do not write "down" migrations (rollback scripts) for this project, because rolling back a financial database schema can be dangerous and complex. Instead, design migrations to be safe to apply and design new migrations to correct any issues.

**Migrations run in a transaction where possible.** DDL statements (CREATE TABLE, ALTER TABLE, CREATE INDEX) can run inside PostgreSQL transactions. If a migration fails partway through, the transaction rolls back and the database is left in its pre-migration state. Wrap each migration in `BEGIN; ... COMMIT;` for safety.

**Large table migrations need special care.** Adding a column with a default value to a table with millions of rows requires a table rewrite in older PostgreSQL versions. PostgreSQL 11 and later handles this efficiently for constant defaults. Adding an index `CONCURRENTLY` allows reads and writes to continue during index creation. These details matter when you have live financial data.

**Migration tracking.** A `schema_migrations` table in each database records which migrations have been applied:

```sql
CREATE TABLE schema_migrations (
  version     VARCHAR(50) PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The migration runner checks this table before applying each migration, skipping already-applied ones.

---

### 9.6 Reconciliation Across Databases

Because data is spread across ten databases, certain cross-database consistency checks cannot be done with SQL JOINs. They require application-level reconciliation.

The most important cross-database check: **every account in the Account Service's `account_db` should have a corresponding record in the Ledger Service's `ledger_db.ledger_accounts` table.**

This consistency is maintained via events: `account.created` triggers the Ledger Service to create a ledger account. But what if that event was lost, or the Ledger Service was down and the event went to the DLQ and was never reprocessed?

The Operations Service runs a nightly reconciliation that calls both the Account Service's internal API (to get all account IDs) and the Ledger Service's internal API (to get all ledger account IDs) and computes the difference. Any account ID that exists in the Account Service but not in the Ledger Service is flagged for investigation.

This kind of cross-service reconciliation is the operational equivalent of the accounting equation check — it verifies that the distributed system's state is internally consistent.

---

## Part B: TypeScript Architecture

### 9.7 The Goal of the Type System

TypeScript's value in a microservices system is not just catching typos at compile time. Its deeper value is making the contracts between services explicit and machine-verifiable.

When the Transfer Service publishes a `transfer.completed` event, it sends a JSON payload over RabbitMQ. The Notification Service receives that payload and tries to access `payload.sourceAccountId`. If the Transfer Service was supposed to send `sourceAccountId` but instead sent `source_account_id` (a naming inconsistency), the Notification Service silently receives `undefined` and probably sends a broken notification.

TypeScript cannot catch this at runtime — the payload is still JSON. But if both services import the same `TransferCompletedEvent` type from `@fintech/shared-events`, TypeScript will catch the inconsistency at compile time, before the code ships.

This is the purpose of the shared type system: **to make inter-service contracts explicit, named, and compiler-enforced.**

---

### 9.8 The Type Hierarchy

Types in this system are organised into three tiers, each with a different scope and stability.

**Tier 1: Shared Types** — defined in the shared packages, used across multiple services. These are the most stable types and change rarely. Changes here affect every service that imports them. Examples: `UserRole`, `TransferStatus`, `EventEnvelope`, all domain model interfaces.

**Tier 2: Service API Types** — DTOs (Data Transfer Objects) that define the shape of HTTP requests and responses for a specific service. These live in `@fintech/shared-types` under `api/` subdirectories and are used by both the service that owns the endpoint and any service or frontend that calls it.

**Tier 3: Service-Local Types** — types used only within a single service. These live in `services/<name>/src/types/`. They represent internal concepts, repository result shapes, and service-layer function parameters. No other service should import these.

This three-tier hierarchy enforces the right scope for every type. If you find yourself wanting to import a service-local type from another service, that is a signal that the type should be promoted to Tier 1 or Tier 2.

---

### 9.9 The `@fintech/shared-types` Package

This package is the lingua franca of the entire system. It defines the core domain model interfaces — the canonical shapes of the business entities.

```typescript
// packages/shared-types/src/domain/user.types.ts
// Purpose: The canonical shape of a user across the system.
// Every service that needs to work with user data uses these types.

export type UserRole =
  | 'customer'
  | 'support_agent'
  | 'auditor'
  | 'manager'
  | 'admin';

export type KycStatus =
  | 'pending'
  | 'submitted'
  | 'verified'
  | 'rejected'
  | 'suspended';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  isEmailVerified: boolean;
  isSuspended: boolean;
  createdAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  kycStatus: KycStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  sessionId: string;
  // This is the shape attached to every Express request after authentication.
  // Downstream services receive this via X-User-ID and X-User-Role headers,
  // which they reconstruct into this shape.
}
```

```typescript
// packages/shared-types/src/domain/account.types.ts

export type AccountStatus = 'active' | 'frozen' | 'closed';
export type AccountType = 'wallet' | 'savings' | 'business';
export type AccountCurrency = 'INR';

export interface Account {
  id: string;
  accountNumber: string;
  ownerId: string;
  name: string;
  type: AccountType;
  status: AccountStatus;
  currency: AccountCurrency;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountLimits {
  accountId: string;
  dailyTransferLimit: number;       // in paise
  singleTransferLimit: number;      // in paise
  monthlyTransferLimit: number;     // in paise
}
```

```typescript
// packages/shared-types/src/domain/transfer.types.ts

export type TransferStatus =
  | 'pending'
  | 'pending_approval'
  | 'funds_reserved'
  | 'completed'
  | 'failed'
  | 'reversing'
  | 'reversed'
  | 'reversal_failed'
  | 'scheduled';

export interface Transfer {
  id: string;
  idempotencyKey: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;                   // in paise
  currency: string;
  description: string | null;
  status: TransferStatus;
  initiatedBy: string;
  approvalId: string | null;
  phase1TransactionId: string | null;
  phase2TransactionId: string | null;
  reversalTransactionId: string | null;
  failureReason: string | null;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
}

export interface TransferSagaStep {
  stepName: string;
  status: 'started' | 'completed' | 'failed';
  occurredAt: Date;
  durationMs: number | null;
  error: string | null;
}
```

```typescript
// packages/shared-types/src/domain/ledger.types.ts

export type LedgerEntryType = 'debit' | 'credit';
export type LedgerAccountType = 'asset' | 'liability' | 'revenue' | 'expense';
export type LedgerReferenceType =
  | 'transfer'
  | 'deposit'
  | 'reversal'
  | 'fee'
  | 'refund'
  | 'adjustment'
  | 'opening_balance';

export interface LedgerAccount {
  id: string;
  accountRef: string;
  name: string;
  type: LedgerAccountType;
  currency: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  entryType: LedgerEntryType;
  amount: number;                   // in paise, always positive
  currency: string;
  description: string | null;
  createdAt: Date;
}

export interface LedgerTransaction {
  id: string;
  idempotencyKey: string;
  referenceId: string;
  referenceType: LedgerReferenceType;
  description: string;
  entries: LedgerEntry[];
  postedAt: Date;
}

export interface AccountBalance {
  accountId: string;
  balance: number;                  // in paise
  currency: string;
  calculatedAt: Date;
  snapshotUsed: boolean;
}
```

---

### 9.10 API DTOs: Request and Response Shapes

DTOs (Data Transfer Objects) are the types that travel over HTTP. They are distinct from domain models because they represent the shape of data as it enters or leaves the system — which is often a subset of the domain model, or a combination of multiple domain models.

```typescript
// packages/shared-types/src/api/transfer.dto.ts

// Request DTOs — what clients send
export interface CreateTransferRequest {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;           // in paise
  currency: 'INR';
  description?: string;
  scheduledAt?: string;     // ISO 8601
}

export interface CreateTransferResponse {
  transferId: string;
  status: TransferStatus;
  message: string;
  requiresApproval: boolean;
  estimatedCompletionAt?: string;
}

export interface GetTransferResponse {
  id: string;
  status: TransferStatus;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
  description: string | null;
  sagaSteps: TransferSagaStep[];
  approvalId: string | null;
  ledgerTransactionIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
```

```typescript
// packages/shared-types/src/api/common.dto.ts
// Shapes used across multiple services.

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiError {
  error: string;           // machine-readable error code: "INSUFFICIENT_FUNDS"
  message: string;         // human-readable description
  details?: unknown;       // additional context, varies by error type
  correlationId: string;   // for tracing the error
  timestamp: string;
}

export interface HealthCheckResponse {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  dependencies: {
    name: string;
    status: 'healthy' | 'unhealthy';
    latencyMs?: number;
  }[];
  timestamp: string;
}
```

---

### 9.11 The `@fintech/shared-events` Package

This package defines the complete event catalog as TypeScript types. Every event that travels through RabbitMQ has a corresponding interface here. This is how the compiler enforces event contracts.

```typescript
// packages/shared-events/src/envelope.ts
// The standard wrapper for every event in the system.

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: string;
  producerService: string;
  correlationId: string;
  causationId: string | null;
  occurredAt: string;           // ISO 8601
  payload: T;
}
```

```typescript
// packages/shared-events/src/transfer.events.ts

export interface TransferRequestedPayload {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
  initiatedBy: string;
  requiresApproval: boolean;
  occurredAt: string;
}

export interface TransferCompletedPayload {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceOwnerId: string;
  destinationOwnerId: string;
  amount: number;
  currency: string;
  phase1TransactionId: string;
  phase2TransactionId: string;
  occurredAt: string;
}

export interface TransferFailedPayload {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
  reason: string;
  failureCode: string;
  occurredAt: string;
}

export interface TransferReversedPayload {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  currency: string;
  reversalTransactionId: string;
  occurredAt: string;
}

export interface TransferReversalFailedPayload {
  transferId: string;
  sourceAccountId: string;
  amount: number;
  currency: string;
  phase1TransactionId: string;
  lastError: string;
  requiresManualIntervention: true;
  occurredAt: string;
}

// Typed event envelope aliases — used by publishers and consumers
export type TransferRequestedEvent =
  EventEnvelope<TransferRequestedPayload>;

export type TransferCompletedEvent =
  EventEnvelope<TransferCompletedPayload>;

export type TransferFailedEvent =
  EventEnvelope<TransferFailedPayload>;

export type TransferReversedEvent =
  EventEnvelope<TransferReversedPayload>;

export type TransferReversalFailedEvent =
  EventEnvelope<TransferReversalFailedPayload>;
```

```typescript
// packages/shared-events/src/account.events.ts

export interface AccountCreatedPayload {
  accountId: string;
  accountNumber: string;
  ownerId: string;
  type: AccountType;
  currency: string;
  occurredAt: string;
}

export interface AccountFrozenPayload {
  accountId: string;
  accountNumber: string;
  ownerId: string;
  frozenBy: string;
  frozenByRole: string;
  reason: string;
  occurredAt: string;
}

export type AccountCreatedEvent = EventEnvelope<AccountCreatedPayload>;
export type AccountFrozenEvent = EventEnvelope<AccountFrozenPayload>;
```

```typescript
// packages/shared-events/src/constants.ts
// Routing key constants — single source of truth for event names.
// If a routing key is mistyped, it produces a compiler error when used
// as a string literal, but these constants catch logical errors.

export const EventTypes = {
  // Transfer events
  TRANSFER_REQUESTED:        'transfer.requested',
  TRANSFER_PENDING_APPROVAL: 'transfer.pending_approval',
  TRANSFER_COMPLETED:        'transfer.completed',
  TRANSFER_FAILED:           'transfer.failed',
  TRANSFER_REVERSED:         'transfer.reversed',
  TRANSFER_REVERSAL_FAILED:  'transfer.reversal_failed',

  // Account events
  ACCOUNT_CREATED:   'account.created',
  ACCOUNT_FROZEN:    'account.frozen',
  ACCOUNT_UNFROZEN:  'account.unfrozen',
  ACCOUNT_CLOSED:    'account.closed',

  // Ledger events
  LEDGER_TRANSACTION_POSTED:       'ledger.transaction.posted',
  LEDGER_RECONCILIATION_COMPLETED: 'ledger.reconciliation.completed',
  LEDGER_RECONCILIATION_FAILED:    'ledger.reconciliation.failed',

  // Deposit events
  DEPOSIT_INITIATED:            'deposit.initiated',
  DEPOSIT_COMPLETED:            'deposit.completed',
  DEPOSIT_FAILED:               'deposit.failed',
  DEPOSIT_ADMIN_CREDIT_APPLIED: 'deposit.admin_credit_applied',

  // User events
  USER_REGISTERED:            'user.registered',
  USER_EMAIL_VERIFIED:        'user.email_verified',
  USER_LOGGED_IN:             'user.logged_in',
  USER_PASSWORD_CHANGED:      'user.password_changed',
  USER_SUSPENDED:             'user.suspended',
  USER_PROFILE_UPDATED:       'user.profile_updated',
  USER_KYC_STATUS_CHANGED:    'user.kyc_status_changed',

  // Approval events
  APPROVAL_CREATED:  'approval.created',
  APPROVAL_APPROVED: 'approval.approved',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_EXPIRED:  'approval.expired',

  // Notification events
  NOTIFICATION_SENT:   'notification.sent',
  NOTIFICATION_FAILED: 'notification.failed',

  // Schedule events
  SCHEDULE_CREATED:           'schedule.created',
  SCHEDULE_TRANSFER_DUE:      'schedule.transfer_due',
  SCHEDULE_EXECUTED:          'schedule.executed',
  SCHEDULE_FAILED:            'schedule.failed',
  SCHEDULE_CANCELLED:         'schedule.cancelled',
  SCHEDULE_APPROVAL_EXPIRY:   'schedule.approval_expiry_check',
  SCHEDULE_RECONCILIATION:    'schedule.reconciliation_due',
} as const;

// Derive a union type of all valid event type strings
export type EventType = typeof EventTypes[keyof typeof EventTypes];
```

---

## Part C: The Shared Packages in Detail

### 9.12 `@fintech/shared-errors`

Consistent error handling across all services is essential. Without it, each service returns errors in a different format, making the API Gateway's job harder and the frontend's error handling chaotic.

```typescript
// packages/shared-errors/src/base.error.ts

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  readonly isOperational: boolean;

  constructor(
    message: string,
    isOperational = true,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

```typescript
// packages/shared-errors/src/http.errors.ts

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly errorCode: string;
  constructor(resource: string, id?: string) {
    super(id
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`
    );
    this.errorCode = `${resource.toUpperCase().replace(' ', '_')}_NOT_FOUND`;
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly errorCode = 'UNAUTHORIZED';
  constructor(message = 'Authentication required') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly errorCode: string;
  constructor(message = 'Access denied', errorCode = 'FORBIDDEN') {
    super(message);
    this.errorCode = errorCode;
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly errorCode: string;
  constructor(message: string, errorCode: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'VALIDATION_ERROR';
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, true, fields);
  }
}

export class TooManyRequestsError extends AppError {
  readonly statusCode = 429;
  readonly errorCode = 'TOO_MANY_REQUESTS';
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`);
  }
}

export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly errorCode = 'SERVICE_UNAVAILABLE';
  constructor(service: string) {
    super(`${service} is temporarily unavailable. Please try again.`, false);
  }
}
```

```typescript
// packages/shared-errors/src/domain.errors.ts

export class InsufficientFundsError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'INSUFFICIENT_FUNDS';
  constructor(
    public readonly accountId: string,
    public readonly availableBalance: number,
    public readonly requiredAmount: number
  ) {
    super(
      `Insufficient funds. Available: ${availableBalance} paise, ` +
      `required: ${requiredAmount} paise.`
    );
  }
}

export class AccountFrozenError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'ACCOUNT_FROZEN';
  constructor(accountId: string) {
    super(`Account ${accountId} is frozen and cannot perform transactions.`);
  }
}

export class AccountClosedError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'ACCOUNT_CLOSED';
  constructor(accountId: string) {
    super(`Account ${accountId} is closed.`);
  }
}

export class TransferLimitExceededError extends AppError {
  readonly statusCode = 422;
  readonly errorCode = 'EXCEEDS_TRANSFER_LIMIT';
  constructor(
    limitType: 'single' | 'daily' | 'monthly',
    limit: number
  ) {
    super(
      `Transfer exceeds the ${limitType} limit of ${limit} paise.`
    );
  }
}

export class KycNotVerifiedError extends AppError {
  readonly statusCode = 403;
  readonly errorCode = 'KYC_NOT_VERIFIED';
  constructor() {
    super('KYC verification is required to perform this operation.');
  }
}

export class IdempotencyConflictError extends AppError {
  readonly statusCode = 409;
  readonly errorCode = 'IDEMPOTENCY_KEY_ALREADY_USED';
  constructor(
    public readonly existingResourceId: string,
    public readonly existingStatus: string
  ) {
    super('This request has already been processed.');
  }
}
```

---

### 9.13 `@fintech/shared-middleware`

Middleware is Express functionality that runs on every request (or every request to a specific route group) before the request handler. The shared middleware package provides the standard middleware used by every service.

```typescript
// packages/shared-middleware/src/correlationId.ts
// Purpose: Ensures every request has a correlation ID.
// Reads the X-Correlation-ID header if present; generates a new UUID if absent.
// Attaches the correlation ID to the request object and sets it in the response.

// Interface augmentation: adds correlationId to Express's Request type
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

// The middleware reads, generates, and attaches the correlation ID.
// Implementation details belong in the service code, not here.
```

```typescript
// packages/shared-middleware/src/authenticate.ts
// Purpose: Validates the JWT access token from the Authorization header.
// Extracts the user identity and attaches it to request.authenticatedUser.
// Checks the Redis token blocklist to handle revoked tokens.
//
// Used by the API Gateway. Downstream services receive the identity
// via X-User-ID and X-User-Role headers injected by the gateway
// and use a lighter-weight trust middleware instead.
```

```typescript
// packages/shared-middleware/src/authorize.ts
// Purpose: RBAC enforcement middleware factory.
// Returns a middleware that checks if the authenticated user's role
// is in the permitted roles list.
//
// Usage: router.post('/freeze', authorize(['admin', 'support_agent']), controller)
//
// Returns 403 if the user's role is not in the permitted list.
// Returns 401 if there is no authenticated user on the request.
```

```typescript
// packages/shared-middleware/src/errorHandler.ts
// Purpose: Centralised Express error handler.
// Catches all errors thrown in route handlers and middleware.
// Maps AppError subclasses to their HTTP responses.
// Maps unknown errors to 500 Internal Server Error.
// Includes the correlationId in all error responses.
// Logs errors with appropriate severity (operational errors as warnings,
// unknown errors as errors).
//
// Shape of every error response:
// {
//   error: string,        -- machine-readable code
//   message: string,      -- human-readable description
//   correlationId: string,
//   timestamp: string
// }
```

```typescript
// packages/shared-middleware/src/requestLogger.ts
// Purpose: Structured access log for every request.
// Logs: method, path, statusCode, durationMs, userId, correlationId.
// Uses structured JSON format for machine parsing.
// Never logs request bodies (potential PII and credential exposure).
```

---

### 9.14 `@fintech/shared-messaging`

The messaging package wraps RabbitMQ interactions so that every service interacts with the message broker through a consistent, type-safe API.

```typescript
// packages/shared-messaging/src/topology.ts
// Defines the exchange and queue topology.
// Called once at service startup to ensure all required exchanges
// and queues exist before the service begins processing.

export interface ExchangeDefinition {
  name: string;
  type: 'topic' | 'direct' | 'fanout';
  durable: boolean;
}

export interface QueueDefinition {
  name: string;
  durable: boolean;
  deadLetterExchange: string;
  deadLetterRoutingKey: string;
  messageTtl?: number;      // optional: max time a message sits in queue
  maxLength?: number;       // optional: max messages before oldest is dropped
}

export interface BindingDefinition {
  queue: string;
  exchange: string;
  routingKey: string;       // supports wildcards: * and #
}
```

```typescript
// packages/shared-messaging/src/publisher.ts
// Publishes events to RabbitMQ exchanges.

export interface PublishOptions {
  persistent: boolean;      // survive RabbitMQ restarts
  correlationId: string;
  contentType: 'application/json';
}

// The publisher wraps the event payload in an EventEnvelope,
// serialises it to JSON, and sends it to the specified exchange
// with the specified routing key.
//
// It provides retry logic: if the publish fails due to a connection
// issue, it retries with exponential backoff up to 3 times.
//
// Key design decision: publishing is synchronous from the caller's
// perspective. The service awaits the publish before continuing.
// This means: if publishing fails after all retries, an error is
// thrown and the caller must decide how to handle it.
// For critical events (like transfer.completed), this is the right
// behaviour — you want to know if the event was not published.
```

```typescript
// packages/shared-messaging/src/consumer.ts
// Consumes messages from a queue.

export interface ConsumeOptions {
  queue: string;
  prefetchCount: number;    // how many unacked messages to hold at once
  // Lower values: slower but less work lost if consumer crashes
  // Higher values: faster throughput but more reprocessing on crash
}

export interface MessageHandler<T> {
  (message: T, envelope: EventEnvelope<T>): Promise<void>;
}

// The consumer:
// 1. Sets up the channel with prefetchCount
// 2. Begins consuming the queue
// 3. For each message:
//    a. Parses the JSON body into EventEnvelope
//    b. Calls the provided handler
//    c. If handler resolves: acks the message
//    d. If handler throws a retriable error: nacks with requeue,
//       increments retry count header
//    e. If retry count >= maxRetries: nacks without requeue
//       (message goes to DLQ)
//    f. If handler throws a non-retriable error (programming error):
//       nacks without requeue immediately
//
// The consumer automatically reconnects if the RabbitMQ connection drops.
```

---

### 9.15 `@fintech/shared-db`

The database package provides utilities for connecting to PostgreSQL and common query patterns.

```typescript
// packages/shared-db/src/client.ts
// Creates a PostgreSQL connection pool using node-postgres (pg).
//
// The pool is configured with:
// - max connections: from environment (default 10)
// - connection timeout: 5 seconds
// - idle timeout: 10 minutes (connections closed if idle too long)
// - SSL: required in production, optional in development
//
// A health check method is exposed to verify connectivity —
// used by the /health endpoint.

export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}
```

```typescript
// packages/shared-db/src/paginate.ts
// Cursor-based pagination utility.
//
// Cursor pagination is preferred over offset pagination for financial data.
//
// Why? With offset pagination (LIMIT 20 OFFSET 40), if a new record
// is inserted before the query runs, the page boundaries shift and
// records can be skipped or duplicated across pages.
//
// With cursor pagination, the cursor encodes the position of the last
// seen record (typically its created_at timestamp and ID for uniqueness).
// Each page query uses WHERE created_at < cursor_timestamp to get
// the next page. Insertions do not affect the page boundaries.

export interface PaginationOptions {
  cursor?: string;          // base64-encoded cursor from previous response
  limit: number;            // between 1 and 100
  direction: 'asc' | 'desc';
}

export interface CursorPayload {
  createdAt: string;
  id: string;
}
```

---

### 9.16 `@fintech/shared-config`

Configuration validation at startup, using Zod.

```typescript
// packages/shared-config/src/env.ts
// Base environment schema that all services extend.
// Each service adds its own service-specific variables on top of these.

// Common variables present in every service:
//   NODE_ENV: 'development' | 'staging' | 'production'
//   PORT: number
//   LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error'
//   DATABASE_URL: string (PostgreSQL connection string)
//   REDIS_URL: string
//   RABBITMQ_URL: string
//   INTERNAL_API_KEY: string (for service-to-service auth)
//   OTEL_EXPORTER_OTLP_ENDPOINT: string (OpenTelemetry collector)
//   SERVICE_NAME: string (for logging and tracing)
//   SERVICE_VERSION: string

// The loadConfig function exported by each service's config/index.ts:
// 1. Extends the base schema with service-specific fields
// 2. Parses process.env through the combined schema
// 3. If parsing fails, logs a clear error and calls process.exit(1)
// 4. Returns the parsed, typed config object
```

---

### 9.17 Monorepo TypeScript Build Pipeline

With ten services and seven shared packages, the build order matters. A service cannot be compiled until all the shared packages it depends on are compiled first. TypeScript project references, configured in each `tsconfig.json`, encode this dependency graph. When you run `tsc --build` at the root, TypeScript compiles packages in the correct order automatically.

The build pipeline for a service like `transfer-service`:

```
Step 1: Compile shared packages (in dependency order)
  @fintech/shared-types        → produces dist/ with .js and .d.ts files
  @fintech/shared-errors       → (depends on shared-types)
  @fintech/shared-events       → (depends on shared-types)
  @fintech/shared-config       → (no shared-type dependency)
  @fintech/shared-db           → (depends on shared-config)
  @fintech/shared-messaging    → (depends on shared-events, shared-config)
  @fintech/shared-middleware   → (depends on shared-types, shared-errors)

Step 2: Compile transfer-service
  → imports from all of the above packages
  → produces services/transfer-service/dist/
```

In development, `tsx --watch` is used instead of `tsc`. It compiles TypeScript on-the-fly without emitting files, giving faster feedback. The production Docker image uses the compiled `dist/` output.

---

### Key Concepts — Chapter 9

- Ten separate PostgreSQL databases enforce the database-per-service principle. Cross-service references are documented but never enforced with foreign keys.
- Universal patterns — UUID PKs, `TIMESTAMPTZ`, soft deletes, `BIGINT` for money, `CHECK` constraints on status columns — apply to every table in every database.
- Indexes are designed for the most frequent query patterns, not applied indiscriminately. Partial indexes on filtered queries (WHERE status = 'pending') are particularly valuable.
- Database migrations are numbered, immutable SQL files. Once applied, they are never edited.
- The type hierarchy has three tiers: shared domain types, service API DTOs, and service-local types.
- `@fintech/shared-events` makes every event contract a TypeScript type. Mismatched publisher and consumer types produce compile errors, not runtime surprises.
- `@fintech/shared-errors` provides a hierarchy of typed, HTTP-aware error classes used identically across all services.
- The `EventTypes` constant object is the single source of truth for all routing key strings, preventing typos from producing silent routing failures.
- Cursor-based pagination is preferred over offset pagination for financial history queries because it is stable under concurrent insertions.

---

### Before You Continue — Chapter 9 Checklist

Before reading Chapter 10, make sure you can answer these:

1. Why are monetary amounts stored as `BIGINT` in paise rather than `DECIMAL` or `FLOAT`?
2. The Notification Service stores a copy of user email addresses. This data also exists in the User Service. What event keeps the Notification Service's copy up to date, and what is the acceptable staleness window?
3. What is a partial index? Give two examples from this chapter of where they are used and why.
4. What is the difference between a domain model type and a DTO? Give a concrete example of each from this chapter.
5. The Transfer Service publishes a `TransferCompletedEvent`. The Notification Service imports `TransferCompletedEvent` from `@fintech/shared-events`. A developer renames the `sourceAccountId` field to `source_account_id` in the publisher. What happens? At what point is the error caught?
6. Why is cursor-based pagination preferred over offset pagination for financial history queries?
7. A migration file was applied to production and contains an error. What is the correct process to fix it?

---

## Chapter 10: Observability — Logging, Metrics, Tracing & Alerting

---

### 10.1 What Observability Actually Means

There is a common misconception that observability means "having logs." Logs are one component of observability, but they are insufficient on their own. A system is truly observable when you can answer arbitrary questions about its internal state by examining the outputs it produces — without needing to modify the system or redeploy it.

The practical test: at 3am, a customer calls support saying a transfer they initiated an hour ago has not arrived. You have never seen this exact failure before. Can you determine, within five minutes, what happened to that transfer, which service caused the problem, what the exact error was, and whether the customer's money is safe?

In an unobservable system, the answer is no. You search through log files manually, compare timestamps across multiple services, and hope the relevant information was logged at all.

In a fully observable system, you search for the transfer's correlation ID and see the complete timeline: every service that touched the request, every decision made, every error encountered, and the current state of every relevant record.

Observability in this system rests on three pillars, plus alerting that acts on all three:

- **Logs** — structured records of discrete events
- **Metrics** — numeric measurements of system behaviour over time
- **Traces** — records of how a request propagated through multiple services

These three pillars are not independent. They are connected by the correlation ID and trace ID that flow through every layer of the system.

---

### 10.2 The Observability Stack

```
Your Services
     │
     ├── Emit structured logs ──────────────→ stdout (collected by Kubernetes)
     │                                              ↓
     │                                    (in production: forwarded to
     │                                     centralised log storage e.g. Loki)
     │
     ├── Emit OpenTelemetry traces ─────────→ OpenTelemetry Collector
     │                                              ↓
     │                                          Jaeger
     │                                    (trace storage and UI)
     │
     └── Expose Prometheus metrics ─────────→ Prometheus (scrapes /metrics)
                                                     ↓
                                                  Grafana
                                            (dashboards and alerting)
```

**OpenTelemetry** is not a storage or visualisation tool — it is a vendor-neutral instrumentation standard. You instrument your code once using the OpenTelemetry SDK, and the telemetry (traces, metrics) flows to any compatible backend. This means you could switch from Jaeger to another tracing backend without changing your application code. OpenTelemetry is the instrumentation layer; Jaeger is the storage and visualisation layer for traces.

**Prometheus** scrapes metric data from your services by making HTTP requests to each service's `/metrics` endpoint every 15 seconds. Your services use a Prometheus client library to expose metrics in Prometheus's text format at that endpoint.

**Grafana** connects to both Prometheus (for metrics) and Jaeger (for traces) and provides a unified dashboard interface.

---

## Part A: Structured Logging

### 10.3 Why Structured Logging

Unstructured logs look like this:

```
[2024-03-15 14:23:11] Transfer abc123 completed for user xyz456 amount 50000
```

This is human-readable but machine-unfriendly. To find all transfers over ₹10,000 that failed, you would need to write a regex to parse this free-text format. Different developers write log lines differently. Automated log analysis is fragile.

Structured logs are JSON objects:

```json
{
  "level": "info",
  "timestamp": "2024-03-15T14:23:11.234Z",
  "service": "transfer-service",
  "version": "1.4.2",
  "message": "Transfer completed",
  "correlationId": "corr-f4a2c1e8",
  "traceId": "trace-8b3d9a12",
  "transferId": "xfer-abc123",
  "userId": "usr-xyz456",
  "amount": 50000,
  "currency": "INR",
  "durationMs": 284
}
```

Every field is a named key-value pair. A log aggregation system can index these fields and answer questions like "show me all log entries where `amount > 1000000` and `level = error` from the `transfer-service` in the last hour" with a simple query. No regex. No guessing about format.

The structured logging library for Node.js in this system is **Pino** — it is significantly faster than alternatives like Winston because it serialises logs asynchronously and defers string formatting.

### 10.4 The Standard Log Schema

Every log entry emitted by every service in this system includes a mandatory set of fields. These are the minimum required for any log entry to be useful in a distributed system.

```typescript
// Conceptual structure — not literal code
interface BaseLogFields {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  timestamp: string;         // ISO 8601, always UTC
  service: string;           // e.g. 'transfer-service'
  version: string;           // service version e.g. '1.4.2'
  environment: string;       // 'development' | 'staging' | 'production'
  message: string;           // human-readable description of what happened
  correlationId: string;     // ties log to the originating request
  traceId?: string;          // OpenTelemetry trace ID (when inside a trace span)
  spanId?: string;           // OpenTelemetry span ID
}

// Request-scoped additional fields (attached by request logger middleware):
interface RequestLogFields extends BaseLogFields {
  method: string;            // HTTP method
  path: string;              // URL path (sanitised — no query params with PII)
  statusCode: number;
  durationMs: number;
  userId?: string;           // authenticated user ID, if present
  userRole?: string;
  contentLength?: number;
}

// Error log additional fields:
interface ErrorLogFields extends BaseLogFields {
  error: string;             // error message
  errorCode: string;         // machine-readable error code
  stack?: string;            // stack trace (development and staging only)
  isOperational: boolean;    // is this an expected operational error?
}
```

### 10.5 Log Levels and Their Meaning

Log levels exist to let you filter signal from noise. The levels in this system, from lowest to highest severity:

**`debug`** — Highly detailed information useful only during active development. Logs internal state, intermediate values, decision points. Never enabled in production (it produces enormous volume and contains information that could aid attackers). Example: "Checking idempotency key in Redis before processing transfer."

**`info`** — Confirmation that expected things are working normally. Logs significant business events. This is the normal production log level. Example: "Transfer completed successfully", "User logged in", "Account created."

**`warn`** — Something unexpected happened but the system recovered or continued. Requires attention but not immediate action. Example: "Retry attempt 2 of 3 for Ledger Service call", "Rate limit approaching threshold for user X", "Balance snapshot is 6 hours old."

**`error`** — A specific operation failed. The service is still running but something did not work as expected. Requires investigation. Example: "Transfer failed due to insufficient funds" (operational error), "Ledger Service returned 503" (dependency error).

**`fatal`** — The service cannot continue operating. Used only when the service is about to crash. Example: "Failed to connect to database after 3 attempts — shutting down."

### 10.6 What to Log — And What Not to Log

**Always log:**
- Service startup and shutdown (with configuration summary excluding secrets)
- Every incoming HTTP request and outgoing response (method, path, status, duration)
- Every event published to RabbitMQ
- Every event consumed from RabbitMQ (start of processing)
- Every significant business outcome (transfer completed, account frozen, deposit credited)
- Every error, with its error code and whether it is operational
- Every external service call (URL, response status, duration)
- Every database query that takes more than 100ms (slow query warning)
- Every DLQ message received (with full payload for debugging)

**Never log:**
- Passwords, PINs, or any credentials
- Full JWT tokens or refresh tokens
- Credit card numbers, bank account numbers, or PAN numbers
- Full request bodies (they may contain any of the above)
- Personally identifiable information in `debug` logs that could reach production
- Stack traces in production (they reveal internal architecture to potential attackers)

### 10.7 Contextual Logging with AsyncLocalStorage

In an async Node.js application, a single request can span many async function calls across many layers (controller → service → repository → external client). You want every log emitted during this request to include the correlation ID. But how do you pass the correlation ID down through every layer without threading it through every function signature?

Node.js provides `AsyncLocalStorage` — a mechanism for storing context that is automatically propagated through async call chains. When the correlation ID middleware runs, it stores the correlation ID in `AsyncLocalStorage`. Any log call made anywhere in that request's async chain can read the correlation ID from `AsyncLocalStorage` without it being explicitly passed.

The logging utility reads from `AsyncLocalStorage` to inject `correlationId` and `traceId` into every log entry automatically. Service code does not need to pass these values to logging functions.

```typescript
// Conceptual structure — illustrative only

// In middleware:
// asyncLocalStorage.run({ correlationId, traceId }, next)

// In any service function called during that request:
// const { correlationId } = asyncLocalStorage.getStore()
// logger.info('Processing transfer', { transferId })
// → automatically includes correlationId in the output
```

---

## Part B: Metrics

### 10.8 What Metrics Are For

Metrics answer questions about system behaviour over time:
- What is the current request rate to the Transfer Service?
- What fraction of transfer requests are failing?
- How long does the Ledger Service take to calculate a balance?
- How many messages are currently waiting in each RabbitMQ queue?
- What is the database connection pool utilisation right now?

Metrics are aggregated numeric values. They do not preserve individual events — you cannot look at a metric and find a specific transfer. That is what logs and traces are for. Metrics tell you about the system's behaviour in aggregate, which is what you need for capacity planning, performance monitoring, and alerting.

### 10.9 The Four Golden Signals

Google's Site Reliability Engineering handbook defines four signals that, if measured and alerted on correctly, are sufficient to detect almost all meaningful system problems. These are the minimum metrics every service must expose:

**Latency** — How long does it take to serve a request? Specifically, both the median (P50) and tail latencies (P95, P99) matter. If P50 is 50ms but P99 is 8 seconds, 1% of your users have a terrible experience that the average hides.

**Traffic** — How many requests is the system serving? Measured as requests per second. A sudden spike in traffic may indicate a legitimate load increase or an attack. A sudden drop may indicate an outage upstream.

**Errors** — What fraction of requests are failing? Measured as a rate (errors per second) and a ratio (errors / total requests). Distinguish between user errors (400-level — usually not your fault) and server errors (500-level — always your fault).

**Saturation** — How "full" is your service? CPU utilisation, memory usage, database connection pool usage, queue depth. As saturation approaches 100%, latency increases and requests start failing.

### 10.10 Prometheus Metric Types

Prometheus has four fundamental metric types. Understanding which to use for which situation is important.

**Counter** — A value that only ever increases. Use for counting things that happen: requests received, transfers completed, errors encountered. You query rate of change (how fast is it increasing?) rather than the absolute value.

```
fintech_transfers_total{status="completed", service="transfer-service"} 14823
fintech_transfers_total{status="failed", service="transfer-service"} 47
```

**Gauge** — A value that can go up or down. Use for things that have a current level: active database connections, in-flight requests, queue depth, memory usage.

```
fintech_active_db_connections{service="ledger-service"} 7
fintech_rabbitmq_queue_depth{queue="transfer-service.transfer.completed"} 0
fintech_transfers_in_flight{service="transfer-service"} 3
```

**Histogram** — Measures the distribution of values. Use for latencies and sizes. It automatically counts observations, sums them, and places them into configurable buckets.

```
fintech_http_request_duration_ms_bucket{service="transfer-service",
  path="/transfers", method="POST", le="100"} 12043
fintech_http_request_duration_ms_bucket{..., le="500"} 14612
fintech_http_request_duration_ms_bucket{..., le="1000"} 14798
fintech_http_request_duration_ms_bucket{..., le="+Inf"} 14823
fintech_http_request_duration_ms_sum{...} 2847391
fintech_http_request_duration_ms_count{...} 14823
```

From a histogram, Prometheus can calculate percentile latencies using the `histogram_quantile` function.

**Summary** — Similar to histogram but calculates percentiles in the client rather than in Prometheus. Less commonly used — histograms are generally preferred because they can be aggregated across multiple service instances.

### 10.11 The Complete Metrics Catalog

Every service exposes the following standard metrics. These are automatically collected by the shared middleware and the shared messaging package — service code does not need to instrument them manually.

**HTTP Metrics (all services):**
```
fintech_http_requests_total
  Labels: service, method, path, status_code
  Type: Counter
  Description: Total HTTP requests received

fintech_http_request_duration_ms
  Labels: service, method, path, status_code
  Type: Histogram
  Buckets: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000
  Description: HTTP request duration in milliseconds

fintech_http_requests_in_flight
  Labels: service
  Type: Gauge
  Description: Currently active HTTP requests
```

**Database Metrics (all services with PostgreSQL):**
```
fintech_db_query_duration_ms
  Labels: service, operation (select/insert/update)
  Type: Histogram
  Description: Database query duration

fintech_db_pool_connections_active
  Labels: service
  Type: Gauge
  Description: Active database connections in pool

fintech_db_pool_connections_idle
  Labels: service
  Type: Gauge
  Description: Idle database connections in pool

fintech_db_errors_total
  Labels: service, error_type
  Type: Counter
  Description: Total database errors
```

**RabbitMQ Metrics (all services using messaging):**
```
fintech_messages_published_total
  Labels: service, exchange, routing_key
  Type: Counter
  Description: Total messages published

fintech_messages_consumed_total
  Labels: service, queue, status (success/failure/dlq)
  Type: Counter
  Description: Total messages consumed

fintech_message_processing_duration_ms
  Labels: service, queue
  Type: Histogram
  Description: Time to process a single message

fintech_queue_depth
  Labels: queue
  Type: Gauge
  Description: Current message depth per queue (scraped from RabbitMQ management API)
```

**Business Metrics (domain-specific):**

Transfer Service:
```
fintech_transfers_initiated_total
  Labels: currency
  Type: Counter

fintech_transfers_completed_total
  Labels: currency
  Type: Counter

fintech_transfers_failed_total
  Labels: currency, failure_code
  Type: Counter

fintech_transfers_reversed_total
  Labels: currency
  Type: Counter

fintech_transfer_amount_paise
  Labels: status (completed/failed)
  Type: Histogram
  Buckets: 10000, 100000, 1000000, 10000000, 100000000
  Description: Distribution of transfer amounts

fintech_saga_duration_ms
  Labels: final_status
  Type: Histogram
  Description: Time from saga start to terminal state

fintech_transfers_pending_approval
  Type: Gauge
  Description: Transfers currently awaiting approval
```

Ledger Service:
```
fintech_ledger_transactions_posted_total
  Labels: reference_type
  Type: Counter

fintech_balance_calculation_duration_ms
  Labels: snapshot_used (true/false)
  Type: Histogram
  Description: Time to calculate an account balance

fintech_reconciliation_result
  Labels: outcome (passed/failed)
  Type: Counter
```

Account Service:
```
fintech_accounts_created_total
  Type: Counter

fintech_accounts_frozen_total
  Labels: frozen_by_role
  Type: Counter

fintech_accounts_active
  Type: Gauge
  Description: Currently active (non-frozen, non-closed) accounts
```

---

## Part C: Distributed Tracing

### 10.12 The Problem Traces Solve

Logs tell you what happened within a single service. Metrics tell you aggregate behaviour across the fleet. But neither answers the question: "For this specific request, what was the complete path through all services, how long did each step take, and where exactly did it slow down or fail?"

Distributed tracing answers this. A trace is a record of the complete journey of a single request across all services it touched. It shows you the call tree — which service called which other service, how long each call took, and what happened at each step.

### 10.13 Traces, Spans, and the OpenTelemetry Model

**A Trace** is the complete record of a request's journey. It has a unique `traceId` (a 128-bit identifier) that is generated when the request first enters the system at the API Gateway and propagated to every subsequent service.

**A Span** is one unit of work within a trace. Each service that participates in handling the request creates one or more spans. A span records:
- Its parent span ID (creating a tree structure)
- The operation name (e.g. "POST /transfers", "ledger.postTransaction", "db.query")
- Start time and duration
- Status (success or error)
- Attributes (key-value pairs with contextual data)
- Events (timestamped annotations within the span)

When the Transfer Service calls the Ledger Service, it creates a **child span** within the current trace. The Transfer Service's span becomes the parent. This creates a hierarchy: the root span covers the entire HTTP request to the API Gateway, and child spans represent each downstream operation.

```
Trace: traceId-abc123 (Total: 423ms)
│
└── [API Gateway] POST /api/v1/transfers (5ms overhead)
    │
    └── [Transfer Service] POST /transfers (418ms)
        ├── [Transfer Service] Validate request (2ms)
        ├── [Account Service] GET /internal/validate (18ms)
        │     └── [Account Service] db.query: select accounts (4ms)
        ├── [User Service] GET /internal/userId (12ms)
        │     └── [User Service] db.query: select kyc_status (3ms)
        ├── [Transfer Service] Check daily limits (8ms)
        │     └── [Transfer Service] db.query: upsert daily_totals (6ms)
        ├── [Ledger Service] POST /transactions (Phase 1) (187ms)
        │     └── [Ledger Service] db.transaction: insert entries (183ms)
        └── [Ledger Service] POST /transactions (Phase 2) (184ms)
              └── [Ledger Service] db.transaction: insert entries (181ms)
```

This visualisation, available in the Jaeger UI, immediately shows you that the ledger database writes are the dominant latency. Everything else is fast. You do not need to correlate log timestamps manually — the trace shows the timeline precisely.

### 10.14 OpenTelemetry Instrumentation

OpenTelemetry provides auto-instrumentation for common Node.js libraries — including Express, node-postgres, http client libraries, and amqplib (for RabbitMQ). Auto-instrumentation means that spans are created automatically for HTTP requests and database queries without you writing any instrumentation code.

You add instrumentation once, at the entry point of each service (`server.ts`), before any other imports:

```typescript
// Conceptual setup — not literal code
// This must be the very first thing that runs, before importing Express
// or any database library, so that OpenTelemetry can patch those libraries.

// 1. Create a TracerProvider configured to export to the OpenTelemetry Collector
// 2. Register the provider globally
// 3. Add auto-instrumentation for:
//    - Express (HTTP server spans)
//    - node-postgres (database query spans)
//    - http/https (outgoing HTTP call spans)
//    - amqplib (RabbitMQ publish and consume spans)
```

For business-level spans — "this is the span for the balance calculation" — you add **manual instrumentation**:

```typescript
// Conceptual — illustrative only
const tracer = opentelemetry.trace.getTracer('transfer-service');

// Creating a manual span for a significant business operation:
const span = tracer.startSpan('saga.phase1LedgerEntry');
span.setAttribute('transfer.id', transferId);
span.setAttribute('transfer.amount', amount);
try {
  const result = await postLedgerTransaction(phase1Entries);
  span.setAttribute('ledger.transactionId', result.transactionId);
  span.setStatus({ code: SpanStatusCode.OK });
  return result;
} catch (error) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.recordException(error);
  throw error;
} finally {
  span.end();
}
```

### 10.15 Trace Context Propagation

For traces to work across service boundaries, the `traceId` and current `spanId` must be passed with every cross-service call so the receiving service can create a child span under the correct parent.

OpenTelemetry handles this through **context propagation**. When the Transfer Service makes an HTTP call to the Ledger Service, the OpenTelemetry auto-instrumentation automatically injects the current trace context into the request headers as the `traceparent` header (W3C Trace Context standard). The Ledger Service's auto-instrumentation automatically extracts this header and links the new span to the parent.

For RabbitMQ messages, trace context is propagated as message headers. When the Transfer Service publishes `transfer.completed`, the trace context is serialised into the message headers. When the Notification Service consumes the message, it extracts the context and creates a span linked to the original request's trace. This allows you to see the complete trace including the asynchronous notification, even though it happened in a different process.

The `correlationId` that flows through your system and the `traceId` that flows through OpenTelemetry serve related but distinct purposes. The `correlationId` is your business-layer identifier — you use it to query logs. The `traceId` is the observability-layer identifier — you use it to query traces. They are both generated at the API Gateway and both propagated everywhere, and they are stored together on every log entry so you can cross-reference between them.

---

## Part D: Alerting

### 10.16 Alerting Philosophy

An alert should wake someone up only if human action is required immediately. Alerts that fire when everything is actually fine (false positives) train engineers to ignore them. Alerts that are too noisy get muted. Both outcomes are dangerous.

The right alerting philosophy: **alert on symptoms, not causes.** 

A symptom is something the user experiences: transfers are failing, logins are slow, notifications are not arriving. A cause is something internal: database CPU is high, a queue is backing up, a cache is cold. Symptoms directly represent user impact. Causes may or may not manifest as user impact (a high-CPU database might still be serving requests fast enough).

Alert on symptoms first. Use metrics about causes to diagnose the symptoms. Do not alert on every internal metric threshold.

### 10.17 Alert Definitions

Each alert is defined as a Prometheus alerting rule — a condition that, when true for a specified duration, fires the alert and sends it to the alerting channel.

**Critical Alerts** — require immediate human response, any time of day:

```yaml
# Transfer reversal has failed — money is stranded
Alert: TransferReversalFailed
Condition: increase(fintech_transfers_reversed_total{status="reversal_failed"}[5m]) > 0
Severity: critical
Message: "A transfer reversal has failed. Money may be stranded in the suspense
          account. Immediate investigation required."

# Ledger reconciliation has failed
Alert: LedgerReconciliationFailed
Condition: increase(fintech_reconciliation_result{outcome="failed"}[1h]) > 0
Severity: critical
Message: "Ledger reconciliation failure detected. Total debits do not equal
          total credits. Financial integrity may be compromised."

# Error rate is critically high across any service
Alert: HighErrorRate
Condition: rate(fintech_http_requests_total{status_code=~"5.."}[5m])
           / rate(fintech_http_requests_total[5m]) > 0.05
Severity: critical
Message: "Error rate exceeds 5% on {{ $labels.service }}."
For: 2 minutes  # must be true for 2 minutes to avoid false positives
```

**Warning Alerts** — require attention during business hours:

```yaml
# Transfer saga is taking unusually long
Alert: SlowTransferSaga
Condition: histogram_quantile(0.95, fintech_saga_duration_ms) > 10000
Severity: warning
Message: "95th percentile transfer saga duration exceeds 10 seconds."
For: 5 minutes

# DLQ messages are accumulating
Alert: DeadLetterQueueNonEmpty
Condition: fintech_queue_depth{queue=~".*\.dlq"} > 0
Severity: warning
Message: "Dead letter queue {{ $labels.queue }} has {{ $value }} messages."
For: 5 minutes

# Database connection pool is nearly exhausted
Alert: DatabasePoolNearlyExhausted
Condition: fintech_db_pool_connections_active
           / (fintech_db_pool_connections_active + fintech_db_pool_connections_idle)
           > 0.85
Severity: warning
Message: "Database pool for {{ $labels.service }} is 85% utilised."
For: 3 minutes

# Latency is degrading
Alert: HighRequestLatency
Condition: histogram_quantile(0.99,
           rate(fintech_http_request_duration_ms_bucket[5m])) > 3000
Severity: warning
Message: "P99 latency on {{ $labels.service }} {{ $labels.path }}
          exceeds 3 seconds."
For: 5 minutes

# Large number of pending approvals — managers may not be working the queue
Alert: PendingApprovalBacklog
Condition: fintech_transfers_pending_approval > 20
Severity: warning
Message: "{{ $value }} transfers are awaiting approval."
For: 30 minutes

# A service is returning no successful responses
Alert: ServiceDown
Condition: rate(fintech_http_requests_total{status_code="200"}[5m]) == 0
           and rate(fintech_http_requests_total[5m]) > 0
Severity: critical
Message: "{{ $labels.service }} is returning no successful responses."
For: 1 minute
```

### 10.18 Grafana Dashboards

Grafana dashboards provide continuous visual visibility into system health. Each dashboard serves a specific audience.

**System Overview Dashboard** (for operations team, always visible on a screen)

This is the first dashboard anyone opens when investigating an issue. It shows:
- Request rate per service (line graph, last 1 hour)
- Error rate per service (line graph)
- P99 latency per service (line graph)
- Active alerts count (stat panel)
- Transfers in the last 24 hours: total, completed, failed (stat panels)
- Current DLQ depths for all queues (table)
- Database connection pool utilisation per service (gauge panels)

**Financial Operations Dashboard** (for finance and operations team)

- Transfer volume over time (line graph)
- Transfer success rate (line graph)
- Average and median transfer amount (stat panels)
- Transfers pending approval (stat panel — highlighted in yellow if > 10)
- Deposits completed in the last 24 hours (stat panel)
- Suspense account balance (should be near zero — critical if large)
- Last reconciliation result (green/red indicator)

**Service Deep-Dive Dashboard** (one per service, for developers)

- Request rate by endpoint (stacked bar)
- Error rate by endpoint and error code (line graph)
- Latency percentiles (P50, P95, P99) by endpoint (line graph)
- Database query latency distribution (histogram panel)
- Message consumption rate (line graph)
- Message processing duration (histogram panel)
- Memory and CPU usage (line graph)

**Trace Explorer** (Jaeger UI integration)

Not a Grafana dashboard but a Jaeger UI view that Grafana links to. Allows searching for traces by service, operation, duration, and tags (including `transfer.id` and `correlationId`).

---

### 10.19 The Health Check Endpoint

Every service exposes two health check endpoints. These are used by Kubernetes (for liveness and readiness probes, covered in Chapter 12) and by the Operations Service dashboard.

**`GET /health/live`** — Liveness check. Answers: "is this process running and not deadlocked?" This endpoint does almost nothing — it just returns `200 OK`. If it returns anything other than 200, Kubernetes assumes the process is broken and restarts it. Do not put expensive checks here.

**`GET /health/ready`** — Readiness check. Answers: "is this service ready to receive traffic?" This checks actual dependencies: can I connect to the database, can I connect to RabbitMQ? If either check fails, the service returns `503` and Kubernetes stops routing traffic to it until the check passes again.

```typescript
// Conceptual structure of the readiness check response
interface HealthCheckResponse {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;               // seconds since process start
  dependencies: {
    name: string;               // 'postgresql' | 'redis' | 'rabbitmq'
    status: 'healthy' | 'unhealthy';
    latencyMs: number;          // time to complete the health check query
    error?: string;             // error message if unhealthy
  }[];
  timestamp: string;
}
```

The `/metrics` endpoint is the fourth always-required endpoint alongside `/health/live` and `/health/ready`. It returns Prometheus metrics in text format. Kubernetes does not use this endpoint directly — Prometheus scrapes it on a schedule.

---

### 10.20 Connecting the Three Pillars

The real power of observability comes from the connections between the three pillars. Here is an example of how an incident investigation flows across all three.

**Scenario**: The "High Error Rate" alert fires at 2:47am. The Transfer Service's error rate has exceeded 5% for two minutes.

**Step 1: Start with metrics.** Open the System Overview Dashboard. The Transfer Service's error rate graph shows errors starting at 2:45am. The error is `503`. Latency also spiked. The Ledger Service shows normal error rate, but its P99 latency jumped from 180ms to 8 seconds at the same time.

**Step 2: Use metrics to hypothesise.** The Ledger Service is responding slowly. The Transfer Service's circuit breaker may have opened, causing it to immediately return 503 to all new transfer requests. The Ledger Service's latency spike is the cause.

**Step 3: Switch to traces.** Search Jaeger for traces to the Transfer Service in the 2:44am–2:47am window with error status. Open one of the failing traces. The trace shows the Transfer Service span failing immediately — the circuit breaker is indeed open. Look at a trace from just before the failures (2:44am). The Ledger Service spans show extremely long database query times.

**Step 4: Switch to logs.** Filter logs from the Ledger Service at 2:44am by `level: error`. You see repeated entries: "Slow query detected: 6800ms on table ledger_entries". Looking at the query, it is the balance calculation. The logs show `snapshotUsed: false` — the balance snapshot job has not run since yesterday. An account with unusually high transaction volume is triggering a full ledger scan.

**Root cause**: The nightly balance snapshot job failed (check scheduler logs — it did, due to a database timeout). Without snapshots, one high-volume account's balance calculations are scanning millions of entries, slowing the entire Ledger Service database.

**Resolution**: Run the balance snapshot manually for the affected account. Restart the Ledger Service to reset circuit breakers. Investigate and fix the snapshot job failure. Total investigation time: 11 minutes.

Without structured logging, metrics dashboards, and distributed traces, this investigation might have taken hours of manual log file searching.

---

### Key Concepts — Chapter 10

- Observability means being able to answer arbitrary questions about system state from external outputs, without modifying the system.
- The three pillars — logs, metrics, traces — are connected by correlation IDs and trace IDs that flow through every layer.
- Structured logging (JSON) enables machine querying and indexing. Every log entry includes service name, correlation ID, and trace ID at minimum.
- Never log passwords, tokens, or full request bodies. Stack traces are development-only.
- `AsyncLocalStorage` propagates correlation context through async call chains without explicit parameter threading.
- The Four Golden Signals — Latency, Traffic, Errors, Saturation — are the minimum metric set for any service.
- Prometheus metric types: Counter (things that happen), Gauge (current levels), Histogram (distributions of values).
- OpenTelemetry is the instrumentation standard; Jaeger stores and visualises the resulting traces.
- Trace context propagates automatically via HTTP headers and RabbitMQ message headers.
- Alert on symptoms (user-visible impact), not causes (internal metrics). Noisy alerts get ignored.
- Every service exposes `/health/live`, `/health/ready`, and `/metrics` endpoints.

---

### Before You Continue — Chapter 10 Checklist

Before reading Chapter 11, make sure you can answer these:

1. What is the difference between a log, a metric, and a trace? Give a concrete example of each from this system.
2. Why is structured (JSON) logging better than free-text logging for a distributed system?
3. A developer wants to log the full request body for debugging purposes. Why is this dangerous, and what is the correct alternative?
4. Explain the Four Golden Signals. For each one, give a specific metric from this system's catalog that measures it.
5. What is the difference between a Counter and a Gauge in Prometheus? Give an example of when you would use each.
6. A transfer request enters the API Gateway and fans out to three downstream services. Explain how the trace context is propagated so that all three services' spans appear in the same trace.
7. The "LedgerReconciliationFailed" alert fires. Using the three-pillar investigation method described in section 10.20, outline the first three steps you would take.
8. What is the difference between `/health/live` and `/health/ready`? Why are they separate endpoints?

---

## Chapter 11: Failure Recovery — Retries, Circuit Breakers, Idempotency & Incident Response

---

### 11.1 Accepting That Failure Is Normal

The first mental shift required for distributed systems engineering is accepting that failure is not exceptional — it is routine. Networks drop packets. Databases time out under load. Services run out of memory and crash. Deployments introduce bugs. Third-party APIs return unexpected errors.

In a monolith, a failure in one function propagates predictably up the call stack and can be caught in one place. In a distributed system, a failure in one service propagates across network boundaries in complex and sometimes invisible ways.

The goal is not to prevent failures — that is impossible. The goal is to design a system that **fails gracefully**: containing failures within service boundaries, recovering automatically wherever possible, and leaving data in a consistent state regardless of where the failure occurred.

This chapter examines every failure recovery mechanism in the system, explains the reasoning behind each, and connects them into a coherent operational posture.

---

## Part A: Retries

### 11.2 When to Retry

Not all failures should be retried. Retrying a failure that will never succeed wastes resources and delays the inevitable. Retrying a failure that already partially succeeded can cause duplication.

The rule: **retry only transient, idempotent operations.**

A **transient failure** is one caused by a temporary condition that is likely to resolve on its own: a database connection timeout, a brief network partition, a downstream service momentarily overloaded. These are worth retrying because the next attempt is likely to succeed.

A **permanent failure** is one caused by a condition that will not resolve by retrying: invalid input data, an account that does not exist, a transfer that exceeds the daily limit. These should not be retried — they should fail fast with a clear error.

An **idempotent operation** is one that can be executed multiple times without producing a different result than executing it once. Reading data is always idempotent. Writing data is idempotent only if it is designed to be — using idempotency keys, upsert patterns, or conditional updates.

The combination of these criteria:

```
Retry if:  failure is transient AND operation is idempotent
Do not retry if: failure is permanent
Do not retry if: operation is not idempotent (risk of duplication)
```

### 11.3 Retry Strategies

**Immediate retry** — retry as soon as the failure occurs. Appropriate only for intermittent failures caused by packet loss (rare) or brief lock contention. In most distributed system scenarios, immediate retry hits the same problem and fails again.

**Fixed delay retry** — wait a fixed time between retries (e.g. 1 second). Better than immediate retry but still problematic under load: if a downstream service is struggling, every service retrying at fixed intervals delivers a sustained flood of traffic that prevents recovery.

**Exponential backoff** — the delay between retries doubles with each attempt:

- First retry: 1 second
- Second retry: 2 seconds
- Third retry: 4 seconds
- Fourth retry: 8 seconds
- Fifth retry: send to DLQ or fail permanently

This gives the downstream service increasing breathing room between attempts.

**Exponential backoff with jitter** — adds a random variation to the delay to prevent the **thundering herd problem**. Without jitter, if 1,000 requests fail simultaneously and all retry at 1 second, 2 seconds, 4 seconds, you get waves of traffic at those exact moments. With jitter, each request adds a random offset to its delay, spreading the retry load smoothly.

The jitter formula: `delay = base_delay * 2^attempt + random(0, base_delay)`

This is the retry strategy for all RabbitMQ message consumers and all HTTP service-to-service calls in this system.

### 11.4 Retry Implementation for HTTP Calls

Service-to-service HTTP calls are made through the `clients/` layer in each service. Each client wraps the HTTP call with retry logic.

```typescript
// Conceptual structure — illustrative only

interface RetryConfig {
  maxAttempts: number;           // e.g. 3
  baseDelayMs: number;           // e.g. 100ms
  maxDelayMs: number;            // e.g. 5000ms — cap the exponential growth
  retryableStatusCodes: number[]; // e.g. [408, 429, 502, 503, 504]
  retryableErrors: string[];     // e.g. ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
}

// The retry wrapper:
// 1. Calls the HTTP function
// 2. If it succeeds: return the result
// 3. If it fails with a retryable error:
//    a. Increment attempt counter
//    b. If attempts < maxAttempts: calculate delay with jitter, wait, try again
//    c. If attempts >= maxAttempts: throw the last error
// 4. If it fails with a non-retryable error: throw immediately (no retry)
//
// The retry wrapper records a metric on each retry attempt:
//   fintech_http_retry_total{service, target_service, attempt_number}
```

Critical: the retry wrapper logs each retry attempt at `warn` level with the attempt number, the delay, and the error that triggered the retry. This creates a searchable trail of retry storms.

### 11.5 Retry Implementation for RabbitMQ Consumers

RabbitMQ message consumers retry differently from HTTP calls because messages are durable — they persist in the queue and can be retried by requeuing rather than by the consumer waiting and trying again.

The retry strategy for message consumers uses a **dead letter exchange with TTL queues**:

```
Normal Queue: transfer-service.approval.approved
  → on nack: message goes to retry exchange

Retry Exchange: fintech.retry
  → routes to a delay queue based on attempt count header

Delay Queue 1 (TTL: 1 second):  fintech.retry.delay.1s
Delay Queue 2 (TTL: 2 seconds): fintech.retry.delay.2s
Delay Queue 3 (TTL: 4 seconds): fintech.retry.delay.4s

After TTL expires in delay queue:
  → message is dead-lettered back to the original queue

After maxAttempts exceeded:
  → message goes to DLQ: transfer-service.approval.approved.dlq
```

The attempt count is tracked in a custom message header `x-retry-count`. When a consumer nacks a message, the shared messaging package increments `x-retry-count` in the message headers and routes it to the appropriate delay queue based on the count. If `x-retry-count` exceeds `maxAttempts`, the message is sent directly to the DLQ.

This architecture means the consumer process does not sit idle waiting for retry delays. The delay is offloaded to RabbitMQ's TTL mechanism. The consumer is free to process other messages while retries are pending.

---

## Part B: Circuit Breakers

### 11.6 The Problem Circuit Breakers Solve

Chapter 4 introduced circuit breakers conceptually. Here is the detailed implementation for this system.

Without circuit breakers, a slow downstream service causes the following cascade:

1. Transfer Service calls Ledger Service. Ledger is slow (10 second responses).
2. Transfer Service requests queue up, each waiting 10 seconds.
3. Transfer Service's thread pool fills up with waiting requests.
4. New transfer requests start timing out.
5. Users see the Transfer Service as unresponsive.
6. The API Gateway's connection pool to the Transfer Service fills up.
7. The API Gateway itself starts degrading.
8. All API endpoints slow down, not just transfers.

A circuit breaker stops step 2 from leading to step 3. Once it detects that the Ledger Service is failing, it immediately rejects all further calls without waiting, preserving the Transfer Service's resources.

### 11.7 The Three States of a Circuit Breaker

```
CLOSED (normal operation)
  ↓ failure threshold exceeded
OPEN (failing fast)
  ↓ reset timeout elapsed
HALF-OPEN (testing recovery)
  ↓ test request succeeds
CLOSED
  ↓ test request fails
OPEN
```

**CLOSED**: The circuit is closed and requests flow through normally. The breaker tracks the success and failure rate of recent calls. If the failure rate exceeds the configured threshold over a sliding window, the circuit opens.

**OPEN**: The circuit is open. All calls fail immediately without being attempted. The error returned is a `ServiceUnavailableError` with a clear message that the downstream service is temporarily unavailable. After a configured timeout (the "reset timeout"), the circuit transitions to HALF-OPEN.

**HALF-OPEN**: The circuit allows a small number of test requests through. If they succeed, the circuit closes (the downstream service has recovered). If they fail, the circuit opens again and the reset timeout restarts.

### 11.8 Circuit Breaker Configuration Per Client

Each service-to-service HTTP client has its own circuit breaker with configuration tuned for that specific dependency:

```
Transfer Service → Ledger Service:
  failureThreshold: 50%       (open if 50% of calls in window fail)
  minimumRequests: 5          (do not open on fewer than 5 requests)
  windowDuration: 10 seconds
  resetTimeout: 30 seconds
  halfOpenRequests: 3         (allow 3 test requests in HALF-OPEN)
  severity: CRITICAL          (this is the financial critical path)

Transfer Service → Account Service:
  failureThreshold: 50%
  minimumRequests: 5
  windowDuration: 10 seconds
  resetTimeout: 30 seconds
  severity: HIGH

Transfer Service → Approval Service:
  failureThreshold: 70%       (more tolerant — approval is async in nature)
  minimumRequests: 3
  windowDuration: 30 seconds
  resetTimeout: 60 seconds
  severity: MEDIUM
```

### 11.9 Circuit Breaker Metrics and Alerts

Circuit breaker state transitions must be observable. Every state transition emits:

A log entry at `warn` level: "Circuit breaker for LedgerService transitioned to OPEN. Failure rate: 67% over last 10 seconds."

A metric event:
```
fintech_circuit_breaker_state
  Labels: service, target_service, state (closed/open/half_open)
  Type: Gauge
  Value: 0=closed, 1=open, 2=half_open
```

An alert fires when any critical-path circuit breaker enters OPEN state:

```yaml
Alert: CriticalCircuitBreakerOpen
Condition: fintech_circuit_breaker_state{severity="critical"} == 1
Severity: critical
Message: "Circuit breaker from {{ $labels.service }} to
          {{ $labels.target_service }} is OPEN."
```

---

## Part C: Idempotency

### 11.10 Idempotency Across the System

Chapter 4 introduced idempotency for message consumers. Chapter 7 introduced idempotency keys for the Transfer Service and Ledger Service. This section unifies the complete idempotency strategy across the entire system.

**Idempotency** is the property that performing an operation multiple times produces the same result as performing it once. In a distributed system where retries are ubiquitous, idempotency is not a nice-to-have — it is a correctness requirement.

There are three places in this system where idempotency must be explicitly designed:

**1. HTTP write endpoints** — Protected by client-provided `Idempotency-Key` headers.

**2. Message consumers** — Protected by the `event_id` in the event envelope, stored in the `processed_events` table of each consuming service.

**3. Saga compensation steps** — Protected by the idempotency keys on Ledger Service transaction posting.

### 11.11 HTTP Idempotency Keys in Detail

The flow for HTTP idempotency:

```
Client sends POST /transfers with:
  Idempotency-Key: client-uuid-abc123
  Body: { sourceAccountId, destinationAccountId, amount }

Transfer Service middleware:
  1. Check Redis for key: idempotency:transfer:client-uuid-abc123
  2a. If found in Redis:
      → Return the cached response immediately (200 or original status code)
      → Do not create a new transfer
  2b. If not found in Redis:
      → Process the request normally
      → On completion (success or failure): store in Redis:
         Key: idempotency:transfer:client-uuid-abc123
         Value: { statusCode, body, transferId, createdAt }
         TTL: 24 hours
      → Return the response to the client
```

The Redis storage happens after the response is computed but the key insight is that **the response is stored in Redis before being returned**. If the service crashes after processing but before storing, the next request with the same key will be processed again. This is acceptable — the Ledger Service's idempotency key on transaction posting provides the inner safety net.

The 24-hour TTL on Redis keys means that idempotency keys are only effective within a 24-hour window. Clients must generate a fresh key for the same logical operation after 24 hours.

### 11.12 Message Consumer Idempotency in Detail

Every event consumer records processed events in a `processed_events` table. The insert and the processing work happen in the same database transaction, making the idempotency check atomic.

```typescript
// Conceptual structure of a properly idempotent consumer

async function handleTransferCompleted(
  event: TransferCompletedEvent
): Promise<void> {

  // Step 1: Begin a database transaction
  await db.transaction(async (txn) => {

    // Step 2: Attempt to record this event as processed.
    // If this insert fails due to a unique constraint violation,
    // the event has already been processed — throw a known error
    // that the consumer framework handles by acking the message.
    const inserted = await txn.query(
      `INSERT INTO processed_events (event_id, event_type, processed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.eventId, event.eventType]
    );

    if (inserted.length === 0) {
      // Duplicate — already processed. Nothing to do.
      return;
    }

    // Step 3: Do the actual work, within the same transaction.
    // If this work fails, the transaction rolls back, including
    // the processed_events insert. The event will be retried.
    await createNotificationForTransfer(txn, event.payload);
  });
}
```

The critical design: the `processed_events` insert and the `createNotificationForTransfer` call happen **inside the same database transaction**. This ensures:

- If the work fails, the `processed_events` record is not committed. The event will be retried.
- If the work succeeds, the `processed_events` record is committed. The event will not be processed again.
- There is no window where the work is done but the idempotency record is not written, or vice versa.

---

## Part D: Timeouts

### 11.13 Every Network Call Must Have a Timeout

A request without a timeout can wait forever. In a distributed system, "waiting forever" is not a theoretical edge case — it happens regularly when services become unresponsive due to overload or bugs.

Every HTTP client call in this system must configure a timeout. The timeout values are calibrated to the expected performance of each service:

```
API Gateway → downstream services:    10 seconds
Transfer Service → Ledger Service:     5 seconds
  (ledger writes should complete in <2s; 5s is generous headroom)
Transfer Service → Account Service:    3 seconds
  (simple lookups, should be <100ms)
Transfer Service → User Service:       3 seconds
Notification Service → email provider: 8 seconds
Scheduler Service → any service:       10 seconds
```

These timeouts are not arbitrary — they are based on the P99 latency of each operation under normal load (from Prometheus metrics) with a safety factor. A timeout too tight causes false failures. A timeout too loose allows degradation to propagate unchecked.

Timeout values are defined in each service's configuration and tunable without code changes.

### 11.14 Timeout Hierarchy

In a chain of calls (API Gateway → Transfer Service → Ledger Service), the outer timeout must be longer than the inner timeouts plus retry delays. If the API Gateway times out the Transfer Service in 10 seconds, but the Transfer Service has a 5-second timeout on the Ledger Service with 3 retry attempts (potentially 15+ seconds of retry time), the gateway will cut the connection before the Transfer Service finishes its retries.

This creates an **orphaned saga** — the Transfer Service continues processing a transfer after the client has given up waiting for the response. The client will retry the transfer (with the same idempotency key), and the Transfer Service's idempotency check will catch the duplicate once the first saga completes.

The solution: design timeout hierarchies so outer timeouts are either longer than inner timeouts plus retry budgets, or accept that orphaned processing will occur and rely on idempotency to handle it safely.

For this system, the transfer creation endpoint returns `202 Accepted` — the client does not wait for the saga to complete, only for the saga to be initiated. This avoids the timeout hierarchy problem entirely for the critical path.

---

## Part E: Fallbacks and Graceful Degradation

### 11.15 Degrading Gracefully

When a non-critical dependency fails, the system should continue operating in a reduced capacity rather than failing completely. This is **graceful degradation**.

In this system, the following degradation scenarios are designed explicitly:

**Notification Service is down.**
No fallback needed for the Transfer Service. Transfers complete normally. Notifications are queued in RabbitMQ and delivered when the Notification Service recovers. Users receive delayed notifications rather than no notifications.

**Redis is down (for caching).**
The balance calculation falls back to a full ledger scan (no snapshot cache). Performance degrades but correctness is maintained. The Ledger Service emits a `warn` log: "Redis unavailable — falling back to full ledger calculation." The performance degradation triggers a latency alert, which prompts investigation.

**Redis is down (for token blocklist).**
This is a hard dependency for security. The gateway fails closed — it rejects all requests rather than potentially allowing invalid tokens through. This is a conscious trade-off: availability is sacrificed to preserve security.

**Reporting Service is down.**
No impact on financial operations. The Operations dashboard shows degraded reporting data but core functionality is unaffected.

**Audit Service consumer is falling behind (DLQ building).**
Financial operations continue. Audit logging is eventually consistent — events are stored in the RabbitMQ queue until the Audit Service processes them. A DLQ alert fires if the consumer consistently fails.

The key principle: **identify which dependencies are hard (their failure should block operations) and which are soft (their failure should be tolerated).**

Hard dependencies for transfers: Account Service, Ledger Service, User Service (KYC check).
Soft dependencies for transfers: Notification Service, Audit Service, Reporting Service.

---

## Part F: Dead Letter Queues in Production

### 11.16 Operating Dead Letter Queues

A DLQ is not a fire-and-forget dumping ground. It is a holding area for messages that require human investigation. An unchecked, growing DLQ represents real unprocessed business events — failed notifications that users are waiting for, audit records that are missing from the compliance log.

The operational posture for DLQs:

**Alert immediately** when any DLQ receives a message (as designed in Chapter 10). Do not wait for the DLQ to grow large.

**Investigate before reprocessing.** A message in the DLQ failed for a reason. That reason may be a bug, invalid data, or a downstream outage. Before reprocessing, understand why it failed. Reprocessing without fixing the root cause will just send it back to the DLQ.

**Classify the failure:**
- **Infrastructure failure** (downstream service was down, database was unavailable): the message is valid but could not be processed due to a transient condition. Fix the infrastructure, then reprocess.
- **Application bug** (a code bug caused the consumer to throw an error): fix the bug, deploy the fix, then reprocess.
- **Poison message** (invalid data that will always fail regardless of infrastructure or bugs): investigate the data, determine if it represents a real business event that must be recorded, and either manually apply the effect or discard the message with documentation.

**The Operations Service provides DLQ management tools:**

```
GET  /api/v1/ops/dlq
     Response: { queues: [{ name, depth, oldestMessageAge }] }

GET  /api/v1/ops/dlq/:queueName/messages
     Response: { messages: [{ id, payload, failureReason, attemptCount }] }
     Note: Paginated. Shows message content for inspection.

POST /api/v1/ops/dlq/:queueName/requeue
     Body: { messageIds: string[] | "all" }
     Response: { requeuedCount: number }
     Note: Moves messages back to the original queue for reprocessing.

DELETE /api/v1/ops/dlq/:queueName/messages
     Body: { messageIds: string[] }
     Response: { discardedCount: number }
     Note: Permanently discards messages. Requires confirmation.
           This action is audited with full operator details.
```

---

## Part G: Incident Response

### 11.17 The Incident Severity Framework

Not all problems are equal. The incident severity framework defines the urgency of response and the communication protocol for each level.

**SEV-1 (Critical)**: System-wide financial correctness is compromised, or the platform is completely unavailable.

Examples:
- Ledger reconciliation failure
- Transfer reversal failure (money stranded)
- All transfers failing (100% error rate)
- Data corruption detected

Response: Immediate response required. Wake up on-call engineer regardless of time. Escalate to management. Status page updated. Financial operations may need to be halted pending investigation.

**SEV-2 (High)**: A core feature is partially unavailable or significantly degraded for a large portion of users.

Examples:
- Transfer success rate below 90%
- Login failure rate above 10%
- Ledger Service P99 latency above 10 seconds
- Multiple DLQ messages accumulating

Response: Response required within 15 minutes. On-call engineer notified. Investigation begins immediately.

**SEV-3 (Medium)**: A feature is degraded but the system is functional. Or a non-critical feature is unavailable.

Examples:
- Notifications are delayed (Notification Service down)
- Reporting dashboards are stale
- Scheduled transfers are delayed (Scheduler Service slow)
- Single DLQ message

Response: Response required within business hours. Monitoring continues.

**SEV-4 (Low)**: Minor issues with minimal user impact. Informational.

Examples:
- A single failed login attempt by one user
- A single retry before successful processing
- Performance slightly above baseline but within SLA

Response: Tracked in issues. Addressed in normal sprint cycle.

### 11.18 The Runbook: Transfer Failure

A runbook is a documented procedure for responding to a specific type of incident. This is the runbook for transfer failures.

**Runbook: Elevated Transfer Failure Rate (SEV-2)**

*Symptoms*: `fintech_transfers_failed_total` is increasing faster than normal. The System Overview dashboard shows transfer error rate above 5%.

**Step 1: Determine the failure scope.**
Is this affecting all transfers or a subset? Check the Transfer Service logs filtered by `level: error`. Are failures concentrated on a specific `failureCode`?

Common failure codes and their implications:
- `INSUFFICIENT_FUNDS` — user error, expected. Check if the rate is genuinely elevated (possible fraud pattern) or normal.
- `ACCOUNT_FROZEN` — possible admin action. Check Operations logs for recent account freezes.
- `LEDGER_SERVICE_UNAVAILABLE` — dependency outage. Check Ledger Service health.
- `CIRCUIT_BREAKER_OPEN` — the circuit breaker to a dependency has opened. Check which dependency.

**Step 2: Check dependency health.**
From the System Overview dashboard, check error rates and latencies for Account Service, Ledger Service, and User Service. If any show elevated errors, the root cause is likely in that dependency.

**Step 3: Check for in-flight saga problems.**
Query the Transfer Service database: how many transfers are currently in `FUNDS_RESERVED` status? This number should be very low (near zero). A high count indicates sagas are getting stuck at Phase 2.

**Step 4: Check the DLQ.**
Check the Operations DLQ dashboard. Are messages accumulating in any Transfer Service-related queue?

**Step 5: Assess financial exposure.**
Query the Ledger Service reconciliation endpoint: is the suspense account balance elevated? Each stranded saga has funds sitting in the suspense account. If the suspense balance is non-zero and not explained by normal in-flight transfers, there may be stuck sagas.

**Step 6: Recovery actions.**
- If a downstream service is down: wait for it to recover. The saga recovery mechanism will automatically resume stuck sagas.
- If the downstream service has recovered but sagas are still stuck: manually trigger the saga recovery job via the Operations Service.
- If there are stuck sagas after the dependency recovers: inspect each stuck transfer and manually advance or reverse them via the Operations Service admin endpoints.
- If money is confirmed stranded (reversal failed): escalate to SEV-1.

**Step 7: Post-incident.**
After resolution, write a brief incident report covering: what happened, when it was detected, how long it lasted, the root cause, the fix applied, and what changes are needed to prevent recurrence or detect it faster.

### 11.19 The Runbook: Ledger Reconciliation Failure

**Runbook: Ledger Reconciliation Failure (SEV-1)**

This is the most serious alert in the system. A reconciliation failure means the fundamental accounting invariant — total debits equal total credits — has been violated.

**Step 1: Do not panic, but act immediately.**

A reconciliation failure does not necessarily mean fraud or data corruption. It could also be caused by a bug in the reconciliation query itself, or a timing issue where a transaction was mid-flight when the reconciliation ran.

**Step 2: Run the reconciliation again immediately.**

Wait 5 minutes, then run the reconciliation again. If it passes on the second attempt, the failure was likely a timing issue. Document it as a false alarm and investigate the reconciliation query for timing sensitivity.

**Step 3: If it fails again, isolate the discrepancy.**

The reconciliation summary endpoint returns `totalDebits`, `totalCredits`, and `difference`. The difference tells you the magnitude. Query the ledger for transactions posted in the last hour. Compare the sum of debits and credits in that window.

**Step 4: Check for very recent transactions.**

A transaction that is partially written (one entry committed but not the other) would cause a reconciliation failure. Check for any ledger transactions in the last 5 minutes where the entries do not balance.

**Step 5: Check the suspense account.**

If the discrepancy equals an amount that is also sitting in the suspense account with no corresponding Phase 2 transaction, there is a stuck saga. Resolve the saga (complete or reverse Phase 1) and run reconciliation again.

**Step 6: If the discrepancy cannot be explained.**

This is a critical data integrity issue. Halt new financial operations temporarily via the Operations Service emergency halt switch. Escalate to senior engineering leadership. Begin forensic analysis of the ledger entries for the discrepancy period.

**Step 7: Document everything.**

Every query run, every finding, every action taken during this incident must be documented. This is both for post-incident review and for any regulatory reporting that may be required.

### 11.20 The Emergency Halt Switch

The Operations Service provides an emergency mechanism to halt all financial operations:

```
POST /api/v1/ops/emergency-halt
     Auth: Admin only
     Body: { reason: string, scope: "all" | "transfers" | "deposits" }
     Response: { halted: true, scope, reason, haltedAt, haltedBy }
```

When a halt is activated:
- A flag is set in Redis: `fintech:emergency_halt:<scope> = true`
- Every service that processes financial operations checks this flag before proceeding
- New operations are rejected with `503 Service Unavailable` and a message indicating planned maintenance
- In-flight operations continue to completion (the halt only affects new requests)
- All active service instances pick up the halt within their next request (Redis check is part of the request pipeline)

The halt is lifted by:

```
DELETE /api/v1/ops/emergency-halt
     Auth: Admin only
     Body: { reason: string }
```

Every halt and lift action is audited with the operator's identity and reason. This is one of the most powerful tools in the Operations Service — use it deliberately and document its use thoroughly.

---

### Key Concepts — Chapter 11

- Retry only transient, idempotent operations. Retrying permanent failures wastes time. Retrying non-idempotent operations risks duplication.
- Exponential backoff with jitter prevents retry storms by spreading retry attempts over time.
- Circuit breakers have three states: CLOSED (normal), OPEN (failing fast), HALF-OPEN (testing recovery). They prevent cascading failures by failing fast when a downstream service is struggling.
- Idempotency for HTTP endpoints is implemented with client-provided keys stored in Redis. Idempotency for message consumers is implemented with `event_id` records stored in the consumer's database within the same transaction as the processing work.
- Every network call must have a configured timeout. Timeouts without retries are incomplete. Retries without idempotency are dangerous.
- Graceful degradation means soft dependencies (Notification Service, Reporting Service) can fail without affecting core financial operations. Hard dependencies (Ledger Service, Account Service) failing should block operations cleanly rather than produce inconsistent results.
- DLQs require active operational management — messages must be investigated, root causes fixed, and messages reprocessed or discarded with documentation.
- The four-level incident severity framework defines response urgency and communication protocol.
- The emergency halt switch is a last-resort tool for halting financial operations during a critical incident.

---

### Before You Continue — Chapter 11 Checklist

Before reading Chapter 12, make sure you can answer these:

1. Why should you not retry a `422 Unprocessable Entity` response from the Ledger Service?
2. A circuit breaker is OPEN for the connection from the Transfer Service to the Ledger Service. What happens to new transfer requests during this time? What happens to ongoing sagas?
3. The Notification Service's `processed_events` insert and the notification record creation must happen in the same database transaction. What exactly goes wrong if they are in separate transactions?
4. The Transfer Service receives a transfer request with an `Idempotency-Key` that it has already processed. What does it return, and how does it know?
5. Redis is unavailable. Which service behaviours degrade gracefully, and which fail hard? Why the difference?
6. A DLQ has 47 messages. An engineer requeues all 47 immediately without investigating. What could go wrong?
7. The ledger reconciliation alert fires. Walk through the first four steps of the incident response runbook and explain the reasoning behind each step.

---

## Chapter 12: Kubernetes Architecture & Deployment

---

### 12.1 What Kubernetes Does For This System

Kubernetes (K8s) is the operating system for your distributed system. It takes your containerised services and manages their deployment, scaling, networking, and recovery across a cluster of machines.

Without Kubernetes, running thirteen services means manually managing thirteen processes, their configurations, their restarts on crash, their scaling under load, their network addresses, and their updates. This is not feasible beyond a small number of services.

Kubernetes automates all of this. You describe the **desired state** of your system — "I want three instances of the Transfer Service running, each with 512MB of memory, accessible at this internal DNS name" — and Kubernetes continuously works to achieve and maintain that state. If an instance crashes, Kubernetes starts a new one. If load increases, Kubernetes can automatically add instances. If you push a new version, Kubernetes replaces old instances with new ones with zero downtime.

This chapter explains the Kubernetes architecture for this system from first principles, assuming you understand containers (Docker) but are new or returning to Kubernetes.

---

### 12.2 Core Kubernetes Concepts

Before examining the system's specific configuration, establish the fundamental vocabulary.

**Cluster**: A set of machines (nodes) that run your containerised workloads. One node is the control plane (manages the cluster). Others are worker nodes (run your containers).

**Pod**: The smallest deployable unit in Kubernetes. A pod contains one or more containers that share a network namespace and storage. In this system, each pod contains exactly one container — one service instance. Pods are ephemeral — they are created and destroyed regularly and should not be thought of as permanent machines.

**Deployment**: A description of the desired state for a set of pods. "I want 3 replicas of the transfer-service pod, using this container image, with these environment variables." Kubernetes compares the desired state (the Deployment) to the actual state (running pods) and makes changes to reconcile them.

**Service** (Kubernetes): A stable network endpoint that load-balances traffic across a set of pods. Pods come and go, but a Kubernetes Service provides a stable DNS name and IP address. When the Transfer Service needs to call the Account Service, it calls the Account Service's Kubernetes Service, not a specific pod.

**ConfigMap**: A Kubernetes object that stores non-secret configuration data (environment variable values, configuration files). Mounted into pods as environment variables or files.

**Secret**: Like ConfigMap, but for sensitive data (database passwords, API keys, JWT private keys). Secrets are base64-encoded in Kubernetes's storage (and should be encrypted at rest in production using a KMS).

**Namespace**: A virtual partition within a cluster. Resources in different namespaces are isolated from each other by default. This system uses three namespaces: `fintech-services` (all application services), `fintech-infra` (databases, Redis, RabbitMQ), and `fintech-observability` (Prometheus, Grafana, Jaeger).

**Ingress**: A rule that routes external HTTP/HTTPS traffic into the cluster. External users hit the Ingress, which routes to the API Gateway's Kubernetes Service.

**HorizontalPodAutoscaler (HPA)**: Automatically scales the number of pod replicas based on CPU usage or custom metrics.

---

### 12.3 The Namespace Architecture

```
Cluster
│
├── Namespace: fintech-services
│   ├── api-gateway           (Deployment + Service + HPA)
│   ├── auth-service          (Deployment + Service)
│   ├── user-service          (Deployment + Service)
│   ├── account-service       (Deployment + Service)
│   ├── ledger-service        (Deployment + Service + HPA)
│   ├── transfer-service      (Deployment + Service + HPA)
│   ├── deposit-service       (Deployment + Service)
│   ├── approval-service      (Deployment + Service)
│   ├── notification-service  (Deployment + Service)
│   ├── audit-service         (Deployment + Service)
│   ├── reporting-service     (Deployment + Service)
│   ├── scheduler-service     (Deployment + Service)
│   └── operations-service    (Deployment + Service)
│
├── Namespace: fintech-infra
│   ├── postgresql            (StatefulSet + Service)
│   ├── redis                 (StatefulSet + Service)
│   └── rabbitmq              (StatefulSet + Service)
│
└── Namespace: fintech-observability
    ├── prometheus            (Deployment + Service)
    ├── grafana               (Deployment + Service + Ingress)
    └── jaeger                (Deployment + Service + Ingress)
```

Namespaces provide a security and organisation boundary. A pod in `fintech-services` can communicate with pods in `fintech-infra` (the application services need to reach the databases), but a pod in `fintech-observability` cannot make arbitrary API calls into `fintech-services` (the observability tools should only scrape metrics, not call business APIs).

Network Policies enforce these boundaries at the Kubernetes network level.

---

### 12.4 The Standard Service Deployment

Every application service uses the same Deployment manifest structure. Here is the Transfer Service as the canonical example, with every field explained:

```yaml
# k8s/base/transfer-service/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: transfer-service
  namespace: fintech-services
  labels:
    app: transfer-service
    tier: application
    version: "1.0.0"
spec:
  replicas: 2                    # Run 2 instances for availability
  selector:
    matchLabels:
      app: transfer-service      # This Deployment manages pods with this label
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0          # Never have fewer than desired replicas
      maxSurge: 1                # Allow 1 extra pod during updates
  template:
    metadata:
      labels:
        app: transfer-service
    spec:
      serviceAccountName: transfer-service-sa  # Kubernetes RBAC for the pod

      # Terminate gracefully: stop accepting new requests, finish in-flight ones
      terminationGracePeriodSeconds: 60

      containers:
        - name: transfer-service
          image: fintech/transfer-service:1.0.0
          imagePullPolicy: Always

          ports:
            - containerPort: 3005  # The port the service listens on

          # Environment variables from ConfigMap (non-sensitive)
          envFrom:
            - configMapRef:
                name: transfer-service-config

          # Environment variables from Secrets (sensitive)
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: transfer-service-secrets
                  key: database-url
            - name: RABBITMQ_URL
              valueFrom:
                secretKeyRef:
                  name: shared-secrets
                  key: rabbitmq-url
            - name: INTERNAL_API_KEY
              valueFrom:
                secretKeyRef:
                  name: transfer-service-secrets
                  key: internal-api-key

          # Resource limits: prevents one service from consuming all cluster resources
          resources:
            requests:             # Kubernetes uses these for scheduling decisions
              cpu: "100m"         # 100 millicores = 0.1 CPU core
              memory: "256Mi"     # 256 megabytes
            limits:               # Pod is killed if it exceeds these
              cpu: "500m"         # 0.5 CPU core maximum
              memory: "512Mi"     # 512 megabytes maximum

          # Liveness probe: is the process alive? If not, restart it.
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3005
            initialDelaySeconds: 10   # Wait before first check
            periodSeconds: 10         # Check every 10 seconds
            timeoutSeconds: 3         # Fail if no response within 3s
            failureThreshold: 3       # Restart after 3 consecutive failures

          # Readiness probe: is the service ready for traffic?
          # If not, remove it from load balancing (but don't restart).
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3005
            initialDelaySeconds: 15   # Give more time for DB connections
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
            successThreshold: 1       # Mark ready after 1 success

      # Pod disruption budget: during voluntary disruptions (cluster upgrades),
      # ensure at least 1 replica remains available
      # (defined separately as a PodDisruptionBudget object)
```

### 12.5 The Kubernetes Service Manifest

```yaml
# k8s/base/transfer-service/service.yaml

apiVersion: v1
kind: Service
metadata:
  name: transfer-service
  namespace: fintech-services
spec:
  selector:
    app: transfer-service        # Routes to pods with this label
  ports:
    - name: http
      port: 80                   # The port other services use to call this one
      targetPort: 3005           # The port the container listens on
  type: ClusterIP                # Internal only — not accessible from outside cluster
```

With this Service, any pod in the cluster can reach the Transfer Service at `http://transfer-service.fintech-services.svc.cluster.local`. The full DNS name can be shortened to `http://transfer-service` from within the same namespace.

### 12.6 The Ingress: External Entry Point

External traffic (from browsers, mobile apps) enters the cluster through a single Ingress point that routes to the API Gateway:

```yaml
# k8s/base/api-gateway/ingress.yaml

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: fintech-ingress
  namespace: fintech-services
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    # TLS termination happens here — downstream uses HTTP
spec:
  tls:
    - hosts:
        - api.fintech.example.com
      secretName: fintech-tls-cert
  rules:
    - host: api.fintech.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 80
```

All HTTPS traffic to `api.fintech.example.com/api/*` is routed to the API Gateway. The TLS certificate is stored as a Kubernetes Secret. TLS is terminated at the Ingress — inside the cluster, services communicate over plain HTTP.

### 12.7 ConfigMaps and Secrets

**ConfigMap** for non-sensitive configuration:

```yaml
# k8s/base/transfer-service/configmap.yaml

apiVersion: v1
kind: ConfigMap
metadata:
  name: transfer-service-config
  namespace: fintech-services
data:
  NODE_ENV: "production"
  PORT: "3005"
  LOG_LEVEL: "info"
  SERVICE_NAME: "transfer-service"
  SERVICE_VERSION: "1.0.0"
  ACCOUNT_SERVICE_URL: "http://account-service.fintech-services.svc.cluster.local"
  LEDGER_SERVICE_URL: "http://ledger-service.fintech-services.svc.cluster.local"
  USER_SERVICE_URL: "http://user-service.fintech-services.svc.cluster.local"
  APPROVAL_SERVICE_URL: "http://approval-service.fintech-services.svc.cluster.local"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://jaeger.fintech-observability:4318"
  APPROVAL_THRESHOLD_PAISE: "10000000"
  MAX_DAILY_TRANSFER_LIMIT_PAISE: "100000000"
```

**Secret** for sensitive data (values are base64-encoded in the YAML, decrypted by Kubernetes before mounting):

```yaml
# k8s/base/transfer-service/secret.yaml
# In practice, secrets are not committed to Git in plain text.
# They are managed by a secrets management tool (Sealed Secrets,
# HashiCorp Vault, or AWS Secrets Manager with External Secrets Operator).

apiVersion: v1
kind: Secret
metadata:
  name: transfer-service-secrets
  namespace: fintech-services
type: Opaque
data:
  database-url: <base64-encoded-connection-string>
  internal-api-key: <base64-encoded-api-key>
```

### 12.8 Horizontal Pod Autoscaler

High-traffic services scale automatically based on CPU utilisation:

```yaml
# k8s/base/transfer-service/hpa.yaml

apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: transfer-service-hpa
  namespace: fintech-services
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: transfer-service
  minReplicas: 2                 # Never scale below 2 (high availability)
  maxReplicas: 10                # Never scale above 10 (cost control)
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # Scale up when average CPU > 70%
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60   # Wait 60s before scaling up again
      policies:
        - type: Pods
          value: 2                     # Add at most 2 pods per scale-up event
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 minutes before scaling down
      # Slow scale-down prevents thrashing
```

Services with scale targets:
- `api-gateway`: 2–20 replicas (highest traffic)
- `ledger-service`: 2–8 replicas (high read load)
- `transfer-service`: 2–10 replicas
- `notification-service`: 2–8 replicas (bursty load)

Services without HPA (stable, low traffic):
- `auth-service`, `user-service`, `account-service`: fixed 2 replicas
- `scheduler-service`: fixed **1 replica** (it uses distributed locking, but
  running multiple instances requires careful design; start with 1)
- `audit-service`: fixed 2 replicas

### 12.9 Health Checks in Practice

The liveness and readiness probe distinction is critical for safe deployments:

**Liveness probe failure** → Kubernetes kills the pod and starts a new one. Use this for deadlocks and unrecoverable states.

**Readiness probe failure** → Kubernetes stops routing traffic to this pod but does not restart it. The pod remains running. Use this for temporary unavailability (warming up, dependent service temporarily down).

The practical consequence: when the database becomes temporarily unavailable, the readiness probe fails. Kubernetes removes the pod from the load balancer. Existing requests being processed complete. No new requests arrive. When the database recovers, the readiness probe passes and the pod rejoins the load balancer. All of this happens automatically, without a pod restart.

If the liveness probe is misconfigured to check the database (a common mistake), Kubernetes would restart the pod every time the database is briefly unavailable. Pod restarts are disruptive — they abort in-flight requests. Keep the liveness probe extremely lightweight: just return 200.

### 12.10 Rolling Deployments

When you push a new version of the Transfer Service:

1. Kubernetes creates a new pod with the new image version.
2. The new pod starts up and runs its readiness check.
3. When the readiness probe passes, Kubernetes adds the new pod to the load balancer.
4. Kubernetes removes one old pod from the load balancer and begins terminating it.
5. The old pod receives a `SIGTERM` signal. The service's signal handler stops accepting new requests and waits for in-flight requests to complete (graceful shutdown).
6. After `terminationGracePeriodSeconds` (60 seconds), the pod is forcefully terminated.
7. Repeat steps 1–6 for each old pod.

The `maxUnavailable: 0` setting ensures that at no point are there fewer running replicas than the desired count. Traffic is never dropped. The `maxSurge: 1` setting allows one extra pod during the rollout.

**Graceful shutdown** is implemented in each service's `server.ts`:

```typescript
// Conceptual structure — illustrative only

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — beginning graceful shutdown');

  // Step 1: Stop accepting new HTTP connections
  httpServer.close();

  // Step 2: Stop consuming new RabbitMQ messages
  await messageConsumer.stop();

  // Step 3: Wait for in-flight requests to complete
  // (httpServer.close() calls the callback when all connections drain)

  // Step 4: Close database connections
  await database.pool.end();

  // Step 5: Close RabbitMQ connection
  await messageConnection.close();

  logger.info('Graceful shutdown complete');
  process.exit(0);
});
```

### 12.11 The Kustomize Overlay System

As designed in Chapter 2, the `k8s/` directory uses Kustomize. Here is how the overlay system works in practice:

**Base manifests** (`k8s/base/`) define the canonical configuration. They use placeholder values for environment-specific settings.

**Local overlay** (`k8s/overlays/local/`) patches the base for local development:

```yaml
# k8s/overlays/local/kustomization.yaml

apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

patches:
  - path: patches/replicas.yaml
  - path: patches/resource-limits.yaml

# In local, use :latest tags for all images (use what's built locally)
images:
  - name: fintech/transfer-service
    newTag: latest
```

```yaml
# k8s/overlays/local/patches/replicas.yaml
# Reduce all services to 1 replica locally to save laptop resources

apiVersion: apps/v1
kind: Deployment
metadata:
  name: transfer-service
spec:
  replicas: 1
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ledger-service
spec:
  replicas: 1
```

To deploy to local (using a local Kubernetes cluster like k3d or minikube):
```
kubectl apply -k k8s/overlays/local/
```

To deploy to production:
```
kubectl apply -k k8s/overlays/production/
```

### 12.12 CI/CD Pipeline

The CI/CD pipeline automates the path from a code commit to running software in production. It uses GitHub Actions.

```
Developer pushes to a feature branch
  ↓
GitHub Actions: CI Pipeline
  ├── Lint all packages (pnpm lint)
  ├── Type-check all packages (pnpm typecheck)
  ├── Run unit tests (pnpm test:unit)
  ├── Run integration tests (against test database)
  ├── Build all Docker images
  └── If all pass: mark commit as "CI passed"

Developer merges PR to main branch
  ↓
GitHub Actions: CD Pipeline (staging)
  ├── Run all tests again
  ├── Build and tag Docker images with commit SHA
  ├── Push images to container registry
  ├── Apply k8s/overlays/staging/ to staging cluster
  ├── Wait for rollout to complete
  ├── Run smoke tests against staging
  └── If all pass: deployment to staging complete

Manual approval by engineer
  ↓
GitHub Actions: CD Pipeline (production)
  ├── Apply k8s/overlays/production/ to production cluster
  ├── Monitor rollout (watch for readiness probe failures)
  ├── Run smoke tests against production
  └── If tests fail: automatic rollback
         (kubectl rollout undo deployment/<name>)
```

### 12.13 Local Development With Kubernetes

For most development work, you do not run services in Kubernetes locally. You run the infrastructure (PostgreSQL, Redis, RabbitMQ) in Docker Compose and run services directly with `tsx --watch`.

Kubernetes is used locally only when you need to test Kubernetes-specific behaviour: service discovery via DNS, rolling deployments, resource limits, health probe behaviour.

For this, use **k3d** — a lightweight Kubernetes distribution that runs inside Docker. It starts in seconds and uses minimal resources:

```bash
# Create a local cluster
k3d cluster create fintech-local --port "8080:80@loadbalancer"

# Build local images
docker build -t fintech/transfer-service:latest \
  -f infra/docker/transfer-service.Dockerfile .

# Import image into k3d (no registry needed for local)
k3d image import fintech/transfer-service:latest -c fintech-local

# Deploy local overlay
kubectl apply -k k8s/overlays/local/

# Watch rollout
kubectl rollout status deployment/transfer-service -n fintech-services
```

---

### Key Concepts — Chapter 12

- Kubernetes manages the desired state of your system — you declare what you want, it maintains it.
- Namespaces partition the cluster: `fintech-services`, `fintech-infra`, `fintech-observability`.
- Deployments manage pod lifecycle. Services provide stable network endpoints. Ingress routes external traffic.
- ConfigMaps hold non-sensitive configuration. Secrets hold sensitive data. Neither should be hardcoded in container images.
- Liveness probes detect dead processes (restart on failure). Readiness probes detect temporary unavailability (remove from load balancer, do not restart).
- Rolling deployments with `maxUnavailable: 0` ensure zero-downtime updates.
- Graceful shutdown on `SIGTERM` drains in-flight requests before the pod terminates.
- HPAs automatically scale replicas based on CPU or custom metrics, within configured min/max bounds.
- Kustomize overlays allow environment-specific configuration without duplicating base manifests.
- The CI/CD pipeline runs tests, builds images, and deploys to staging then production, with automatic rollback on failure.

---

### Before You Continue — Chapter 13 Checklist

Before reading Chapter 13, make sure you can answer these:

1. What is the difference between a Kubernetes Service and a Kubernetes Deployment?
2. Why does the Scheduler Service run with a fixed replica count of 1 rather than using an HPA?
3. A new version of the Ledger Service is deployed. The new version has a bug that causes the readiness probe to fail. What happens? What does the user experience?
4. Why are liveness probes kept extremely lightweight? What goes wrong if a liveness probe checks the database connection?
5. What is the difference between ConfigMap and Secret? When would you use each?
6. A pod receives `SIGTERM`. Walk through the graceful shutdown sequence and explain what would happen to an in-flight transfer request that is currently in Phase 1 of its saga.
7. Why is `terminationGracePeriodSeconds: 60` set to 60 seconds specifically? What should this value be based on?

---

## Chapter 13: Testing Strategy — Unit, Integration, Contract, End-to-End & Load Tests

---

### 13.1 Why Testing in a Fintech System Is Different

Testing any software system is important. Testing a fintech system is non-negotiable. The consequences of a bug in a social media app are annoying. The consequences of a bug in a payment system are financial loss, regulatory scrutiny, and broken user trust that may never recover.

But beyond the higher stakes, fintech systems present specific testing challenges that most CRUD applications do not:

**Concurrency correctness is hard to observe.** A race condition in the daily transfer limit check might only manifest when two requests arrive within milliseconds of each other. A single test run will not catch it. You need concurrency-specific tests.

**Distributed failures are difficult to reproduce.** The Transfer Service crashing exactly between Phase 1 and Phase 2 of a saga is unlikely in normal operation but catastrophic when it happens. You need chaos tests that deliberately inject these failures.

**Financial invariants must hold under all conditions.** The accounting equation — total debits equal total credits — must hold not just when everything works, but when services crash, when messages are duplicated, when retries occur. Your test suite must verify these invariants explicitly.

**Side effects are real.** In most applications, a test that accidentally sends a real email is a minor inconvenience. A test that accidentally posts a real ledger entry or initiates a real bank transfer is a serious incident. Every test environment must be completely isolated from any financial infrastructure.

This chapter designs a comprehensive testing strategy that addresses all of these challenges across five levels: unit, integration, contract, end-to-end, and load tests.

---

### 13.2 The Testing Pyramid

The testing pyramid is a model for how many tests of each type you should have. It reflects the trade-off between speed, isolation, and confidence.

```
        /\
       /E2E\          Few (10–30)
      /------\        Slow, brittle, expensive
     / Integ. \       Moderate (50–200 per service)
    /----------\      Medium speed, some isolation
   / Unit Tests \     Many (200–500+ per service)
  /--------------\    Fast, isolated, cheap
```

**Unit tests** are at the base because they are fast (milliseconds), cheap to write, easy to maintain, and catch the most common category of bugs — logic errors in business rules. You should have many of them.

**Integration tests** are in the middle. They test how components work together — a service layer talking to a real database, an HTTP endpoint processing a real request. They are slower (seconds) because they involve real infrastructure, but they catch a different category of bugs that unit tests miss: database constraint violations, SQL query errors, middleware configuration mistakes.

**End-to-end tests** are at the top. They test complete user journeys through the entire running system. They are slowest (minutes), most brittle (any infrastructure change can break them), and most expensive to maintain. But they provide the highest confidence that the system works as a whole. You should have relatively few — focused on the most critical happy paths and failure scenarios.

Load tests and chaos tests are outside the pyramid but sit alongside it — they test dimensions (performance, resilience) that the pyramid's layers do not cover.

---

## Part A: Unit Tests

### 13.3 What Unit Tests Test

A unit test tests a single function or class in isolation. Every dependency — databases, HTTP clients, message queues, other services — is replaced with a **mock** or a **stub**.

A **mock** is a controlled replacement for a dependency. You define what it returns when called. After the test, you verify it was called correctly.

A **stub** is simpler — it just returns a fixed value and you do not verify how it was called.

Unit tests answer: "Given this input, does this function produce the correct output, assuming all its dependencies behave as expected?"

### 13.4 What to Unit Test — And What Not To

**Test:**
- Business logic and domain rules in the `services/` layer
- Calculation functions (balance calculations, limit checks, amount conversions)
- State machine transition validation (is this saga status transition valid?)
- Input validation logic (Zod schemas, custom validators)
- Error handling paths (does InsufficientFundsError get thrown when balance is insufficient?)
- Idempotency check logic
- Event payload construction (does the publisher build the correct envelope?)
- Utility functions (paise-to-rupee conversion, cursor encoding/decoding)

**Do not unit test:**
- Database queries in repositories (these need a real database — integration tests)
- HTTP routing (Express middleware chains — integration tests)
- RabbitMQ consumption (needs a real broker — integration tests)
- TypeScript types (the compiler verifies these — no test needed)
- Trivial getters and setters

### 13.5 The Testing Framework

This system uses **Vitest** — a Vite-native testing framework that is API-compatible with Jest but significantly faster. In a monorepo with many services, test speed compounds — Vitest's faster startup time across dozens of test files saves meaningful developer time.

Vitest provides:
- `describe` and `it` / `test` for test organisation
- `expect` for assertions
- `vi.fn()` for creating mock functions
- `vi.spyOn()` for spying on existing methods
- `vi.mock()` for module-level mocking
- Built-in TypeScript support
- Coverage reporting

### 13.6 Unit Test Structure: The Arrange-Act-Assert Pattern

Every unit test follows the same three-part structure. This pattern, called **AAA (Arrange-Act-Assert)**, makes tests readable, consistent, and easy to debug when they fail.

```typescript
// Conceptual structure — illustrative only

describe('TransferService', () => {
  describe('validateTransferRequest', () => {

    it('should throw InsufficientFundsError when source balance is below transfer amount', async () => {
      // ARRANGE: Set up the test data and mock dependencies
      const mockLedgerClient = {
        getBalance: vi.fn().mockResolvedValue({
          accountId: 'acc-source',
          balance: 30000,      // ₹300 in paise
          currency: 'INR',
          calculatedAt: new Date().toISOString()
        })
      };

      const transferService = new TransferService({
        ledgerClient: mockLedgerClient,
        // ... other mocked dependencies
      });

      const transferRequest = {
        sourceAccountId: 'acc-source',
        destinationAccountId: 'acc-dest',
        amount: 50000,           // ₹500 — more than the ₹300 balance
        currency: 'INR' as const
      };

      // ACT: Call the function being tested
      const act = () => transferService.validateTransferRequest(transferRequest);

      // ASSERT: Verify the outcome
      await expect(act()).rejects.toThrow(InsufficientFundsError);
      await expect(act()).rejects.toMatchObject({
        errorCode: 'INSUFFICIENT_FUNDS',
        accountId: 'acc-source',
        availableBalance: 30000,
        requiredAmount: 50000
      });
    });

    it('should throw AccountFrozenError when source account is frozen', async () => {
      // ARRANGE
      const mockAccountClient = {
        validateAccounts: vi.fn().mockResolvedValue({
          valid: false,
          reason: 'ACCOUNT_FROZEN',
          frozenAccountId: 'acc-source'
        })
      };
      // ... rest of the test
    });

    it('should pass validation when all conditions are met', async () => {
      // Test the happy path too — not just error paths
    });

  });
});
```

### 13.7 Unit Testing the Saga Logic

The Transfer Service's saga is the most complex business logic in the system. Unit tests must cover every saga step and every compensation path.

```typescript
// Conceptual structure — illustrative only

describe('SagaService', () => {

  describe('executeTransferSaga', () => {

    it('transitions to FUNDS_RESERVED after Phase 1 ledger entry succeeds', async () => {
      const mocks = createSagaMocks({
        ledgerClient: {
          postTransaction: vi.fn()
            .mockResolvedValueOnce({ transactionId: 'txn-phase1' }) // Phase 1 succeeds
            .mockResolvedValueOnce({ transactionId: 'txn-phase2' }) // Phase 2 succeeds
        }
      });

      const result = await sagaService.executeTransferSaga(validTransfer, mocks);

      expect(result.status).toBe('completed');
      expect(mocks.transferRepository.updateStatus)
        .toHaveBeenCalledWith(validTransfer.id, 'funds_reserved');
      expect(mocks.transferRepository.updateStatus)
        .toHaveBeenCalledWith(validTransfer.id, 'completed');
    });

    it('initiates compensation when Phase 2 fails after Phase 1 succeeds', async () => {
      const mocks = createSagaMocks({
        ledgerClient: {
          postTransaction: vi.fn()
            .mockResolvedValueOnce({ transactionId: 'txn-phase1' })  // Phase 1 succeeds
            .mockRejectedValueOnce(new ServiceUnavailableError('Ledger Service')) // Phase 2 fails
            .mockResolvedValueOnce({ transactionId: 'txn-reversal' }) // Compensation succeeds
        }
      });

      const result = await sagaService.executeTransferSaga(validTransfer, mocks);

      expect(result.status).toBe('reversed');
      // Verify compensation was called with the correct reversal entries
      expect(mocks.ledgerClient.postTransaction)
        .toHaveBeenNthCalledWith(3, expect.objectContaining({
          referenceType: 'reversal',
          entries: expect.arrayContaining([
            expect.objectContaining({
              accountId: validTransfer.sourceAccountId,
              entryType: 'debit'
            })
          ])
        }));
    });

    it('sets status to REVERSAL_FAILED when both Phase 2 and compensation fail', async () => {
      const mocks = createSagaMocks({
        ledgerClient: {
          postTransaction: vi.fn()
            .mockResolvedValueOnce({ transactionId: 'txn-phase1' })
            .mockRejectedValue(new ServiceUnavailableError('Ledger Service'))
            // All subsequent calls fail — Phase 2 retries + compensation
        }
      });

      const result = await sagaService.executeTransferSaga(validTransfer, mocks);

      expect(result.status).toBe('reversal_failed');
      // Verify critical alert metric was emitted
      expect(mocks.metrics.incrementCounter)
        .toHaveBeenCalledWith('fintech_transfers_reversal_failed_total');
    });

  });

});
```

### 13.8 Unit Testing the Ledger Service

The Ledger Service's core logic — enforcing accounting invariants — must be tested exhaustively.

```typescript
// Conceptual structure — illustrative only

describe('LedgerService', () => {

  describe('validateTransaction', () => {

    it('rejects a transaction where debits do not equal credits', () => {
      const transaction = {
        entries: [
          { accountId: 'acc-a', entryType: 'debit' as const, amount: 50000 },
          { accountId: 'acc-b', entryType: 'credit' as const, amount: 40000 }
          // 50000 debits vs 40000 credits — does not balance
        ]
      };

      expect(() => ledgerService.validateTransaction(transaction))
        .toThrow(expect.objectContaining({
          errorCode: 'ENTRIES_DO_NOT_BALANCE'
        }));
    });

    it('rejects a transaction with a single entry', () => {
      const transaction = {
        entries: [
          { accountId: 'acc-a', entryType: 'debit' as const, amount: 50000 }
        ]
      };

      expect(() => ledgerService.validateTransaction(transaction))
        .toThrow(expect.objectContaining({
          errorCode: 'MINIMUM_TWO_ENTRIES_REQUIRED'
        }));
    });

    it('rejects a transaction with a zero amount entry', () => {
      const transaction = {
        entries: [
          { accountId: 'acc-a', entryType: 'debit' as const, amount: 0 },
          { accountId: 'acc-b', entryType: 'credit' as const, amount: 0 }
        ]
      };

      expect(() => ledgerService.validateTransaction(transaction))
        .toThrow(expect.objectContaining({ errorCode: 'INVALID_AMOUNT' }));
    });

    it('accepts a valid balanced transaction', () => {
      const transaction = {
        entries: [
          { accountId: 'acc-a', entryType: 'debit' as const, amount: 50000 },
          { accountId: 'acc-b', entryType: 'credit' as const, amount: 50000 }
        ]
      };

      expect(() => ledgerService.validateTransaction(transaction)).not.toThrow();
    });

  });

  describe('calculateBalance', () => {

    it('returns zero for an account with no entries', () => {
      expect(ledgerService.calculateBalance([], null)).toBe(0);
    });

    it('correctly sums debits and credits from entries', () => {
      const entries = [
        { entryType: 'debit' as const, amount: 100000 },   // +100000
        { entryType: 'debit' as const, amount: 50000 },    // +50000
        { entryType: 'credit' as const, amount: 30000 },   // -30000
      ];
      // Expected: 100000 + 50000 - 30000 = 120000
      expect(ledgerService.calculateBalance(entries, null)).toBe(120000);
    });

    it('uses snapshot as base and only sums entries after snapshot date', () => {
      const snapshot = { balance: 500000, snapshotAt: new Date('2024-03-01') };
      const entries = [
        { entryType: 'debit' as const, amount: 50000,
          createdAt: new Date('2024-03-02') },  // after snapshot — included
        { entryType: 'credit' as const, amount: 20000,
          createdAt: new Date('2024-02-28') },  // before snapshot — excluded
      ];
      // Expected: 500000 (snapshot) + 50000 (debit after snapshot) = 550000
      expect(ledgerService.calculateBalance(entries, snapshot)).toBe(550000);
    });

  });

});
```

### 13.9 Test Factories and Fixtures

Creating test data by hand in every test leads to verbose, fragile tests. A small change to a type's required fields breaks every test that creates that type manually.

**Test factories** solve this by providing builder functions that create valid test objects with sensible defaults. Tests only specify the fields relevant to what they are testing.

```typescript
// tests/fixtures/transfer.fixtures.ts
// Conceptual structure — illustrative only

import { Transfer, TransferStatus } from '@fintech/shared-types';

export function createTransferFixture(
  overrides: Partial<Transfer> = {}
): Transfer {
  return {
    id: 'xfer-test-' + Math.random().toString(36).slice(2),
    idempotencyKey: 'idem-test-' + Math.random().toString(36).slice(2),
    sourceAccountId: 'acc-source-default',
    destinationAccountId: 'acc-dest-default',
    amount: 50000,                // ₹500
    currency: 'INR',
    description: 'Test transfer',
    status: 'pending' as TransferStatus,
    initiatedBy: 'usr-test-default',
    approvalId: null,
    phase1TransactionId: null,
    phase2TransactionId: null,
    reversalTransactionId: null,
    failureReason: null,
    scheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    failedAt: null,
    ...overrides      // caller overrides only the fields they care about
  };
}

// Usage in a test:
const frozenAccountTransfer = createTransferFixture({
  sourceAccountId: 'acc-frozen',
  amount: 100000
});
// All other fields have sensible defaults — the test only declares what matters
```

---

## Part B: Integration Tests

### 13.10 What Integration Tests Test

Integration tests verify that components work correctly together. They use real infrastructure — a real PostgreSQL database, real Redis, real RabbitMQ — rather than mocks. They test:

- HTTP endpoints from the outside (the full Express middleware chain, routing, controller, service, and repository layers)
- Database queries (does the SQL actually work? are constraints enforced?)
- Event publishing and consuming (does the event actually arrive in the queue?)
- Idempotency keys being stored and checked in Redis

Integration tests answer: "Does this service's externally visible behaviour match the contract it promises?"

### 13.11 Integration Test Infrastructure

Each service's integration tests run against a dedicated test database, a test Redis instance, and a test RabbitMQ instance. These are started by Docker Compose in the CI environment.

**Test database isolation**: Each test file uses a dedicated database schema or runs inside a database transaction that is rolled back after each test. This ensures tests do not interfere with each other.

The recommended approach for this system: use **database transactions for isolation**. Each test wraps its database operations in a transaction. The test's setup runs, the test executes, and then — regardless of pass or fail — the transaction is rolled back. The database is left in its pre-test state for the next test.

```typescript
// Conceptual structure — illustrative only

describe('Transfer Service API — POST /transfers', () => {

  let app: Express.Application;
  let db: DatabaseClient;
  let testTransaction: DatabaseTransaction;

  beforeAll(async () => {
    // Start the Express app once for all tests in this file
    app = createTestApp();
    db = createTestDatabaseClient();
    await db.connect();
  });

  beforeEach(async () => {
    // Begin a transaction before each test
    testTransaction = await db.beginTransaction();
    // Inject this transaction into the app's database client
    // so all service-layer queries use it
    app.locals.db = testTransaction;
  });

  afterEach(async () => {
    // Rollback after each test — the database is clean for the next test
    await testTransaction.rollback();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('creates a transfer and returns 202 Accepted', async () => {
    // ARRANGE: Seed the test data needed for this test
    await seedTestAccount(testTransaction, {
      id: 'acc-source',
      ownerId: 'usr-alice',
      status: 'active'
    });
    await seedTestAccount(testTransaction, {
      id: 'acc-dest',
      status: 'active'
    });
    await seedLedgerBalance(testTransaction, 'acc-source', 500000); // ₹5000

    // Mock the external services this service calls
    nock('http://account-service')
      .get('/internal/validate')
      .query(true)
      .reply(200, { valid: true, sourceOwnerKycStatus: 'verified' });

    nock('http://ledger-service')
      .post('/transactions')
      .reply(201, { transactionId: 'txn-phase1' });

    // ACT: Make the HTTP request
    const response = await request(app)
      .post('/transfers')
      .set('X-User-ID', 'usr-alice')
      .set('X-User-Role', 'customer')
      .set('X-Correlation-ID', 'corr-test-123')
      .set('Idempotency-Key', 'idem-test-abc')
      .send({
        sourceAccountId: 'acc-source',
        destinationAccountId: 'acc-dest',
        amount: 50000,
        currency: 'INR'
      });

    // ASSERT: Verify the response
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      transferId: expect.any(String),
      status: expect.stringMatching(/^(pending|completed)$/)
    });

    // Verify the transfer was persisted in the database
    const savedTransfer = await testTransaction.query(
      'SELECT * FROM transfers WHERE idempotency_key = $1',
      ['idem-test-abc']
    );
    expect(savedTransfer).toHaveLength(1);
    expect(savedTransfer[0].amount).toBe(50000);
  });

  it('returns 409 Conflict when the same idempotency key is used twice', async () => {
    // Seed the existing transfer record
    await seedTransfer(testTransaction, {
      idempotencyKey: 'idem-duplicate',
      status: 'completed'
    });

    const response = await request(app)
      .post('/transfers')
      .set('Idempotency-Key', 'idem-duplicate')
      .send(validTransferBody);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('IDEMPOTENCY_KEY_ALREADY_USED');
  });

  it('enforces database constraint: transfer amount must be positive', async () => {
    const response = await request(app)
      .post('/transfers')
      .set('X-User-ID', 'usr-alice')
      .set('Idempotency-Key', 'idem-negative')
      .send({ ...validTransferBody, amount: -500 });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

});
```

### 13.12 Testing Event Publishing

Integration tests must verify that the service publishes the correct events to RabbitMQ after certain operations. Use a test consumer that captures published messages.

```typescript
// Conceptual structure — illustrative only

describe('Transfer Service — Event Publishing', () => {

  let testConsumer: TestMessageConsumer;

  beforeAll(async () => {
    // Connect to the test RabbitMQ instance and create a consumer
    // that captures all messages published to the test exchange
    testConsumer = await createTestConsumer('fintech.transfers.test');
  });

  afterAll(async () => {
    await testConsumer.disconnect();
  });

  it('publishes transfer.completed event when saga succeeds', async () => {
    // Trigger a successful transfer through the API
    await request(app)
      .post('/transfers')
      .set(testAuthHeaders)
      .send(validTransferBody);

    // Wait for the event to be published (with timeout)
    const event = await testConsumer.waitForMessage(
      'transfer.completed',
      { timeoutMs: 5000 }
    );

    expect(event).toBeDefined();
    expect(event.payload).toMatchObject({
      sourceAccountId: validTransferBody.sourceAccountId,
      amount: validTransferBody.amount,
      currency: 'INR'
    });
    expect(event.correlationId).toBeDefined();
  });

});
```

### 13.13 Testing the Ledger Service's Accounting Invariants

The Ledger Service's integration tests must verify the double-entry constraints at the database level, not just the application level.

```typescript
// Conceptual structure — illustrative only

describe('Ledger Service — Accounting Invariants', () => {

  it('rejects a transaction that would make an asset account balance negative', async () => {
    // ARRANGE: Account with balance of ₹300 (30000 paise)
    await postTransaction({
      entries: [
        { accountId: 'acc-alice', entryType: 'debit', amount: 30000 },
        { accountId: 'SYS_SUSPENSE_TRANSFER', entryType: 'credit', amount: 30000 }
      ]
    });

    // ACT: Try to debit ₹400 (more than the ₹300 balance)
    const response = await request(app)
      .post('/transactions')
      .set('X-Internal-API-Key', testApiKey)
      .set('Idempotency-Key', 'idem-overdraft-test')
      .send({
        entries: [
          { accountId: 'SYS_SUSPENSE_TRANSFER', entryType: 'debit', amount: 40000 },
          { accountId: 'acc-alice', entryType: 'credit', amount: 40000 }
        ]
      });

    // ASSERT
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('INSUFFICIENT_FUNDS');
  });

  it('maintains total debit-credit balance across multiple transactions', async () => {
    // Post several transactions
    await postMultipleTestTransactions();

    // Query the reconciliation endpoint
    const response = await request(app)
      .get('/reconciliation/summary')
      .set('X-Internal-API-Key', testApiKey);

    expect(response.body.difference).toBe(0);
    // If this ever fails, something is deeply wrong
  });

  it('is idempotent: posting the same transaction twice produces one record', async () => {
    const idempotencyKey = 'idem-double-post-test';

    await postTransaction({ idempotencyKey, ...validTransaction });
    const secondResponse = await postTransaction({
      idempotencyKey,
      ...validTransaction
    });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.originalTransactionId).toBeDefined();

    // Verify only one set of entries exists in the database
    const entries = await db.query(
      `SELECT le.* FROM ledger_entries le
       JOIN ledger_transactions lt ON le.transaction_id = lt.id
       WHERE lt.idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(entries).toHaveLength(2); // Only the original two entries
  });

});
```

---

## Part C: Contract Tests

### 13.14 What Contract Tests Solve

In a microservices system, services communicate through contracts: "Service A expects Service B's API to return this shape of data." As services evolve independently, these contracts can drift. Service B changes its response format. Service A was not updated. Runtime errors occur.

Contract tests verify these agreements without requiring both services to run simultaneously. There are two sides to a contract test:

**Provider tests** — run against the actual service and verify it fulfils its promises.
**Consumer tests** — run in isolation and verify the consumer handles responses correctly.

The recommended tool for this is **Pact** — a contract testing framework that records consumer expectations into a "pact file" and then verifies the provider meets those expectations.

For this system, the most critical contracts to test are:

- Transfer Service (consumer) ↔ Ledger Service (provider)
- Transfer Service (consumer) ↔ Account Service (provider)
- Notification Service (consumer) ↔ shared event schemas (provider concept)

### 13.15 Contract Test Structure

```typescript
// Consumer test: Transfer Service expects this from Ledger Service
// Conceptual structure — illustrative only

describe('Transfer Service — Contract with Ledger Service', () => {

  const provider = new PactProvider({
    consumer: 'transfer-service',
    provider: 'ledger-service'
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());

  it('expects POST /transactions to return 201 with transactionId', async () => {
    // Define what the consumer expects the provider to do
    await provider.addInteraction({
      state: 'accounts exist and source has sufficient balance',
      uponReceiving: 'a valid balanced transaction',
      withRequest: {
        method: 'POST',
        path: '/transactions',
        headers: { 'X-Internal-API-Key': 'test-key' },
        body: {
          referenceId: like('transfer-id'),     // any string
          referenceType: 'transfer',
          entries: eachLike({
            accountId: like('account-id'),
            entryType: term({ generate: 'debit', matcher: 'debit|credit' }),
            amount: like(50000)
          }, { min: 2 })
        }
      },
      willRespondWith: {
        status: 201,
        body: {
          transactionId: like('transaction-id'),
          postedAt: like('2024-03-15T14:23:11.234Z')
        }
      }
    });

    // Run the consumer code against the mock provider
    const ledgerClient = new LedgerClient(provider.mockService.baseUrl);
    const result = await ledgerClient.postTransaction(testTransaction);

    expect(result.transactionId).toBeDefined();
  });

});
```

The Pact framework records this interaction into a pact file. The Ledger Service then runs a provider verification test that replays the recorded interactions against the real Ledger Service, confirming it responds as the consumer expects.

---

## Part D: End-to-End Tests

### 13.16 What End-to-End Tests Cover

End-to-end (E2E) tests run against the complete system — all services running, all infrastructure running, the frontend running. They simulate real user behaviour.

For this system, E2E tests use **Playwright** (for browser-based user journeys) and **Supertest against the API Gateway** (for API-level E2E tests without a browser).

E2E tests are expensive to write and maintain. Focus them on:
- The most critical happy paths (a user registering, creating an account, and completing a transfer)
- The most critical failure paths (a transfer failing due to insufficient funds and the user's balance being unchanged)
- Security boundaries (a user trying to access another user's account)

### 13.17 Critical E2E Test Scenarios

**Scenario 1: Complete Transfer Happy Path**

```
1. Register user Alice
2. Verify Alice's email
3. Login as Alice → receive access token
4. Create an account for Alice
5. Admin credits Alice's account with ₹10,000
6. Register user Bob
7. Verify Bob's email
8. Create an account for Bob
9. Login as Alice
10. Initiate transfer of ₹500 from Alice to Bob
11. Poll transfer status until completed (or timeout at 30 seconds)
12. Assert: Alice's balance = ₹9,500
13. Assert: Bob's balance = ₹500
14. Assert: Ledger reconciliation passes (total debits = total credits)
```

**Scenario 2: Transfer Insufficient Funds**

```
1. Create Alice with ₹300 balance
2. Attempt transfer of ₹500 from Alice to Bob
3. Assert: 422 response with error INSUFFICIENT_FUNDS
4. Assert: Alice's balance is still ₹300 (unchanged)
5. Assert: Bob's balance is still ₹0 (unchanged)
6. Assert: Ledger reconciliation passes
```

**Scenario 3: Large Transfer Approval Flow**

```
1. Create Alice with ₹200,000 balance
2. Create Manager user
3. Alice initiates transfer of ₹150,000 (above approval threshold)
4. Assert: transfer status is pending_approval
5. Login as Manager
6. Approve the transfer
7. Poll transfer status until completed
8. Assert: Alice's balance = ₹50,000
9. Assert: destination balance = ₹150,000
```

**Scenario 4: Frozen Account Cannot Transfer**

```
1. Create Alice with ₹5,000 balance
2. Admin freezes Alice's account
3. Alice attempts to initiate a transfer
4. Assert: 422 response with error ACCOUNT_FROZEN
5. Assert: Alice's balance unchanged
```

**Scenario 5: Idempotency — Duplicate Transfer Requests**

```
1. Create Alice with ₹5,000 balance, Bob with ₹0
2. Send POST /transfers with Idempotency-Key: test-idem-001
3. Immediately send POST /transfers again with same Idempotency-Key: test-idem-001
4. Wait for both responses
5. Assert: only one transfer exists in the system
6. Assert: Alice's balance = ₹4,500 (transferred once, not twice)
7. Assert: Bob's balance = ₹500
```

**Scenario 6: RBAC — Customer Cannot Access Another User's Account**

```
1. Create Alice and Bob with their respective accounts
2. Login as Alice
3. Attempt GET /accounts/<Bob's account ID>
4. Assert: 403 Forbidden
5. Assert: Audit log shows access attempt was recorded
```

### 13.18 E2E Test Helpers

E2E tests require extensive test data setup. A suite of helper functions reduces boilerplate and keeps tests focused on what they are testing.

```typescript
// Conceptual structure — illustrative only

// Test helpers encapsulate the API calls needed for setup
const testHelpers = {
  registerAndVerifyUser: async (email: string, role = 'customer') => {
    // Register, extract verification token from the test email inbox,
    // verify email, return { userId, accessToken }
  },

  createAndFundAccount: async (userId: string, balancePaise: number) => {
    // Create account, admin-credit it, return { accountId }
  },

  waitForTransferCompletion: async (
    transferId: string,
    accessToken: string,
    timeoutMs = 30000
  ) => {
    // Poll GET /transfers/:id until status is terminal
    // Return the final transfer record
  },

  getAccountBalance: async (accountId: string, accessToken: string) => {
    // GET /ledger/accounts/:id/balance
    // Return balance in paise
  },

  assertLedgerBalanced: async (adminToken: string) => {
    // GET /ledger/reconciliation/summary
    // Assert difference === 0
  }
};
```

---

## Part E: Load Tests

### 13.19 What Load Tests Measure

Load tests answer questions that no other test type can:

- At what request rate does the system start showing elevated latency?
- Where is the bottleneck — CPU, database connections, RabbitMQ throughput?
- Does the system handle a sudden traffic spike without crashing?
- Does performance degrade gracefully as load increases, or does it cliff-edge?
- Are the Kubernetes HPA settings tuned correctly for real traffic patterns?

**k6** is the load testing tool for this system. It is written in Go, extremely efficient (a single k6 instance can generate tens of thousands of requests per second), and uses JavaScript for test scripts — familiar to a TypeScript developer.

### 13.20 Load Test Scenarios

**Scenario 1: Sustained Normal Load**

Simulates expected daily traffic. Ramp up to the expected normal load, sustain for 10 minutes, ramp down.

```javascript
// k6 test script — conceptual structure
// k6 uses plain JavaScript, not TypeScript

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 virtual users over 2 minutes
    { duration: '10m', target: 50 },  // Hold at 50 VUs for 10 minutes
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    // Define pass/fail criteria
    http_req_duration: ['p(95)<500'],   // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],     // Less than 1% error rate
  }
};

export default function() {
  // Each virtual user executes this function repeatedly
  const loginResponse = http.post(`${BASE_URL}/api/v1/auth/login`, {
    email: `user_${__VU}@test.com`,  // VU = virtual user number
    password: 'TestPassword123!'
  });
  check(loginResponse, { 'login succeeded': (r) => r.status === 200 });

  const token = loginResponse.json('accessToken');

  const balanceResponse = http.get(
    `${BASE_URL}/api/v1/ledger/accounts/${accountIds[__VU]}/balance`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  check(balanceResponse, { 'balance retrieved': (r) => r.status === 200 });

  sleep(1);   // 1 second think time between requests
}
```

**Scenario 2: Transfer Load Test**

The transfer saga is the most resource-intensive operation. Test it specifically.

```javascript
// Conceptual structure

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 concurrent transfers
    { duration: '5m', target: 10 },   // Sustain
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:transfer}': ['p(99)<3000'],  // Transfers under 3s at P99
    'http_req_failed{name:transfer}': ['rate<0.001'],    // Less than 0.1% failure
  }
};
```

**Scenario 3: Spike Test**

Tests the system's behaviour under a sudden, unexpected traffic spike.

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Normal load
    { duration: '10s', target: 200 },  // Sudden 20x spike
    { duration: '3m', target: 200 },   // Sustain spike
    { duration: '30s', target: 10 },   // Return to normal
    { duration: '1m', target: 0 },
  ]
};
```

**Scenario 4: Endurance Test**

Runs at moderate load for an extended period (2+ hours) to detect memory leaks and resource accumulation that only manifest over time.

```javascript
export const options = {
  stages: [
    { duration: '2h', target: 25 },  // Sustained moderate load for 2 hours
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // Slightly relaxed threshold for endurance
  }
};
```

### 13.21 Load Test Results Analysis

After a load test, examine:

**From k6 output:**
- Median, P95, P99 request duration per endpoint
- Error rate per endpoint
- Throughput (requests per second)

**From Grafana:**
- CPU and memory usage of each service during the test
- Database connection pool utilisation (did it become saturated?)
- RabbitMQ queue depths (did queues back up under load?)
- HPA scaling events (did autoscaling kick in, and was it fast enough?)

**Key findings to look for:**
- If P99 latency grows linearly with load: expected, tune the threshold
- If P99 latency spikes at a specific request rate: you have found a bottleneck
- If error rate jumps suddenly at a specific load: you have found a breaking point
- If database pool is 100% utilised: add read replicas or increase pool size
- If memory grows continuously during endurance test: investigate memory leak

---

## Part F: Chaos Testing

### 13.22 What Chaos Tests Verify

Chaos testing deliberately injects failures into a running system to verify that it recovers correctly. Where load tests ask "how does the system behave under load?", chaos tests ask "how does the system behave when things break?"

For a fintech system, the critical chaos scenarios are:

**Service crash during saga execution:**
Kill the Transfer Service process while a saga is in `FUNDS_RESERVED` state. Verify that when the service restarts, the saga recovery mechanism resumes the saga correctly and money is not lost.

**Database connectivity loss:**
Disconnect the Ledger Service from its database for 30 seconds. Verify that in-flight transactions either complete correctly after reconnection or fail safely without partial entries.

**RabbitMQ connection loss:**
Disconnect a service from RabbitMQ. Verify that messages published before the disconnection are not lost, and messages that arrive during the disconnection are processed after reconnection.

**Duplicate event delivery:**
Manually publish the same event twice to a consumer queue. Verify that the consumer processes it exactly once (idempotency).

**DLQ message injection:**
Publish a deliberately malformed message to a consumer queue. Verify that it eventually lands in the DLQ without causing the consumer to crash or stop processing valid messages.

### 13.23 Chaos Test Implementation

Chaos tests are scripted operations that can be run against a staging environment. They are not automated in the same way as unit or integration tests — they require observation and manual verification of system behaviour.

The tools:
- **kubectl** to kill specific pods or disconnect services from the network
- **toxiproxy** to inject network latency, packet loss, or connection termination between services
- Custom scripts to publish duplicate or malformed messages to RabbitMQ

A chaos test has three phases:

**1. Steady state verification:** Confirm the system is functioning normally before injecting the failure. Check error rates, queue depths, saga statuses.

**2. Failure injection:** Apply the failure condition. Document exactly what was done and when.

**3. Recovery observation:** Monitor the system recovering. Verify the financial invariants hold. Check that no money was created or destroyed. Check the reconciliation endpoint. Confirm sagas reached terminal states.

---

### 13.24 Testing Milestones

Structure your testing work to grow alongside your service implementation:

**Milestone: Service complete**
Before moving on from any service, it must have:
- Unit tests covering all business logic paths (happy and error)
- Integration tests covering all HTTP endpoints
- Integration tests verifying database constraints
- Integration tests verifying event publishing

**Milestone: Service pair complete**
When two services need to communicate (e.g. Transfer Service + Ledger Service):
- Contract tests for their API interaction
- Integration tests for the end-to-end flow through both services

**Milestone: Core financial flow complete**
When Register → Create Account → Deposit → Transfer is implemented:
- E2E tests for the complete happy path
- E2E tests for all critical failure scenarios
- Ledger reconciliation verification in all E2E tests

**Milestone: Full system complete**
- Load tests at expected normal load
- Load tests at 3x expected load (headroom)
- Spike tests
- Chaos tests for all critical failure scenarios
- Endurance test

---

### Key Concepts — Chapter 13

- The testing pyramid: many unit tests (fast, isolated), fewer integration tests (real infrastructure), few E2E tests (complete system).
- Unit tests test business logic with mocked dependencies. Integration tests test real components together. E2E tests test complete user journeys.
- Arrange-Act-Assert is the universal test structure. Every test setup, execution, and assertion is clearly separated.
- Test factories create valid domain objects with sensible defaults, reducing test verbosity and fragility.
- Integration tests use database transactions for isolation — each test rolls back after completion.
- Contract tests with Pact verify that service API contracts are not broken by independent service evolution.
- E2E tests focus on critical paths and always verify the ledger reconciliation invariant.
- Load tests use k6 with defined thresholds that constitute pass/fail criteria for performance.
- Chaos tests deliberately inject failures to verify saga recovery, idempotency, and graceful degradation.
- Every completed service must have unit and integration tests before moving to the next service.

---

### Before You Continue — Chapter 14 Checklist

Before reading Chapter 14, make sure you can answer these:

1. Why do unit tests mock all dependencies rather than using real databases and services?
2. Why do integration tests use database transaction rollback for isolation rather than clearing data between tests?
3. An E2E test for the happy-path transfer always ends with `assertLedgerBalanced()`. Why? What would it mean if this assertion failed?
4. The Transfer Service sends a `TransferCompletedEvent` with field `sourceAccountId`. The Notification Service consumes it expecting `source_account_id`. A contract test catches this. Explain how.
5. A load test shows that P99 transfer latency is 200ms at 10 concurrent users but jumps to 4500ms at 50 concurrent users. What do you investigate first?
6. Design a chaos test for the scenario: "Transfer Service crashes between publishing `transfer.completed` to RabbitMQ and writing `completedAt` to its own database." What is the expected system behaviour? How do you verify the money is safe?
7. Why are chaos tests not run in continuous integration the same way unit and integration tests are?

---

## Chapter 14: The Implementation Roadmap — 15 Milestones to a Production-Grade Fintech Platform

---

### 14.1 How to Use This Roadmap

Every milestone in this chapter produces a **working system**. Not a partially broken scaffold. Not a collection of files that will eventually work together. A system you can run, interact with, and verify is correct before you build the next layer on top of it.

This is the most important principle of the roadmap. Building distributed systems is complex enough without the added confusion of having ten half-finished services that individually make no sense. Each milestone adds a complete, tested capability to the system. By Milestone 3, you can register a user and log in. By Milestone 6, you can create accounts and see balances. By Milestone 10, you can move money with full double-entry accounting. Every milestone is a checkpoint where the system is provably correct before you continue.

The milestones are sequenced to teach concepts in the right order. Infrastructure before services. Authentication before business logic. Simple financial operations before complex orchestrated sagas. Observability is introduced early and grown throughout, not bolted on at the end.

Estimated total calendar time for a single developer working part-time: 16–24 weeks. Working full-time: 8–12 weeks. These are learning estimates, not professional delivery estimates — the goal is deep understanding of each concept, not minimum viable implementation speed.

---

## Milestone 1: Monorepo Foundation & Infrastructure

### Objective

Establish the complete project structure, developer tooling, and local infrastructure. By the end of this milestone, every tool and technology that will be used throughout the project is running locally and verified.

### What You Build

**Monorepo structure:**
Create the complete directory layout from Chapter 2. Every folder exists, even if empty. The project structure communicates the full system design from day one.

**Root tooling:**
- `pnpm-workspace.yaml` declaring all workspace packages
- Root `package.json` with workspace scripts (`dev`, `build`, `test`, `lint`, `typecheck`, `infra:up`, `infra:down`)
- `tsconfig.base.json` with strict TypeScript settings
- `.eslintrc.base.js` with consistent linting rules across all packages
- `.gitignore` excluding `node_modules`, `dist`, `.env` files
- Root `.env.example` documenting all infrastructure connection strings

**Shared packages (scaffolded, not fully implemented):**
Create the `package.json` and `tsconfig.json` for every shared package:
- `@fintech/shared-types` — empty `src/index.ts`
- `@fintech/shared-errors` — empty `src/index.ts`
- `@fintech/shared-events` — empty `src/index.ts`
- `@fintech/shared-middleware` — empty `src/index.ts`
- `@fintech/shared-db` — empty `src/index.ts`
- `@fintech/shared-messaging` — empty `src/index.ts`
- `@fintech/shared-config` — empty `src/index.ts`

**Local infrastructure (`docker-compose.yml`):**
- PostgreSQL 16 with health check
- Redis 7 with health check
- RabbitMQ 3.13 with management UI, health check, and the `definitions.json` topology file
- Prometheus with a basic `prometheus.yml` scrape config
- Grafana connected to Prometheus as a data source
- Jaeger with OTLP HTTP collector

**Infrastructure verification scripts (`scripts/dev/`):**
- `verify-infra.sh` — connects to each infrastructure component and confirms it is healthy
- `create-databases.sh` — creates all ten PostgreSQL databases (one per service)

### Concepts Learned

- pnpm workspaces and monorepo dependency management
- TypeScript project references and incremental compilation
- Docker Compose for local infrastructure orchestration
- RabbitMQ exchange and queue topology definition
- PostgreSQL multi-database setup

### Testing Requirements

- `verify-infra.sh` passes cleanly (all infrastructure components respond)
- `pnpm typecheck` passes from the root (no TypeScript errors in scaffolded packages)
- `pnpm lint` passes from the root
- All ten databases exist and are accessible

### Success Criteria

```
✓ pnpm install completes without errors from the repository root
✓ docker-compose up -d starts all six infrastructure services
✓ verify-infra.sh confirms all components are healthy
✓ PostgreSQL has ten separate databases created
✓ RabbitMQ management UI at localhost:15672 shows the expected exchanges and queues
✓ Prometheus at localhost:9090 is running
✓ Grafana at localhost:3001 is running and connected to Prometheus
✓ Jaeger at localhost:16686 is running
✓ pnpm typecheck passes
✓ pnpm lint passes
```

---

## Milestone 2: Shared Packages Foundation

### Objective

Implement the shared packages fully. These are the foundation that every service builds on. Getting them right before building services prevents inconsistency and rework.

### What You Build

**`@fintech/shared-types` (complete):**
All domain model interfaces from Chapter 9: `User`, `UserProfile`, `Account`, `Transfer`, `LedgerEntry`, `LedgerTransaction`, `AccountBalance`, `Session`. All status type unions. All DTO interfaces for requests and responses. The `PaginatedResponse<T>` and `ApiError` interfaces.

**`@fintech/shared-errors` (complete):**
The full error hierarchy from Chapter 9: `AppError` base class, all HTTP errors (`NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `TooManyRequestsError`, `ServiceUnavailableError`), all domain errors (`InsufficientFundsError`, `AccountFrozenError`, `AccountClosedError`, `TransferLimitExceededError`, `KycNotVerifiedError`, `IdempotencyConflictError`).

**`@fintech/shared-events` (complete):**
The `EventEnvelope<T>` interface. All event payload interfaces for every event in the system. All typed event envelope aliases. The `EventTypes` constants object. Every event type from the complete event catalog.

**`@fintech/shared-config` (complete):**
The Zod-based base environment schema. The `loadConfig` function that validates at startup and exits with a clear error if validation fails.

**`@fintech/shared-db` (complete):**
The PostgreSQL connection pool factory using `node-postgres`. The `DatabaseClient` interface with `query`, `transaction`, and `healthCheck` methods. The cursor-based pagination utilities (`encodeCursor`, `decodeCursor`, `buildCursorQuery`).

**`@fintech/shared-messaging` (complete):**
The RabbitMQ connection management using `amqplib`. The topology declaration function (idempotent — safe to call on every service startup). The typed publisher with retry logic and `EventEnvelope` wrapping. The typed consumer with acknowledgement, retry counting, and DLQ routing.

**`@fintech/shared-middleware` (complete):**
The `correlationId` middleware. The `requestLogger` middleware (Pino-based structured logging). The `errorHandler` Express error handler. The `authenticate` middleware (JWT RS256 verification with Redis blocklist check). The `authorize` middleware factory. The `rateLimiter` middleware (Redis-backed sliding window).

### Concepts Learned

- TypeScript generics for event envelopes and paginated responses
- Zod schema validation for environment variables
- node-postgres connection pooling and transaction management
- amqplib AMQP protocol usage
- Pino structured logging
- Express middleware chain design
- JWT RS256 verification without calling the Auth Service

### Testing Requirements

Each shared package has unit tests covering its core logic:
- `shared-errors`: every error class has correct `statusCode` and `errorCode`
- `shared-events`: `EventTypes` constants match routing key strings
- `shared-config`: `loadConfig` exits with helpful message when required vars are missing
- `shared-db`: cursor encoding/decoding is symmetric
- `shared-middleware`: `errorHandler` maps each error class to the correct HTTP status

### Success Criteria

```
✓ pnpm build compiles all shared packages without errors
✓ pnpm test:unit passes for all shared packages
✓ All shared package exports are accessible via their package names
  (import { Transfer } from '@fintech/shared-types' works in any service)
✓ shared-config: starting a service with a missing DATABASE_URL env var
  prints a clear error and exits with code 1
✓ shared-errors: new InsufficientFundsError(account, 30000, 50000)
  has statusCode 422 and errorCode 'INSUFFICIENT_FUNDS'
```

---

## Milestone 3: Auth Service & API Gateway

### Objective

Users can register and log in. The two-token system is working. Every subsequent service is protected by JWT authentication enforced at the gateway.

### What You Build

**Auth Service (complete):**
- All four database tables with migrations (`users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`)
- Registration endpoint with bcrypt password hashing and email verification token generation
- Login endpoint with JWT access token issuance and refresh token cookie
- Refresh endpoint with token rotation
- Logout endpoint with session revocation and blocklist entry
- Email verification endpoint
- Password reset request and confirmation endpoints
- Session listing and revocation endpoints
- Event publishing: `user.registered`, `user.logged_in`, `user.password_changed`, `user.email_verified`
- Health check endpoints (`/health/live`, `/health/ready`)
- Prometheus metrics endpoint (`/metrics`)
- OpenTelemetry instrumentation

**API Gateway (complete):**
- Routing table for all planned service endpoints (returns `503` for services not yet built)
- JWT validation middleware using Auth Service's public key
- Correlation ID middleware
- Rate limiting middleware (Redis-backed)
- Request logging middleware
- Error handler
- Health check endpoint
- Reverse proxy to Auth Service routes

### Concepts Learned

- bcrypt password hashing and timing-safe comparison
- RS256 asymmetric JWT signing and verification
- HttpOnly cookie security for refresh tokens
- Refresh token rotation and theft detection
- Redis token blocklist for immediate access token invalidation
- Reverse proxy configuration in Express
- OpenTelemetry SDK setup for Node.js (the tracing initialisation pattern that must run first)

### Testing Requirements

**Auth Service unit tests:**
- Password hashing and comparison
- JWT payload construction and validation
- Refresh token rotation logic
- Token blocklist check logic

**Auth Service integration tests:**
- `POST /register` creates a user and publishes `user.registered` event
- `POST /login` returns access token and sets refresh cookie
- `POST /login` with wrong password returns 401
- `POST /login` with unverified email returns 403
- `POST /refresh` with valid refresh token returns new access token
- `POST /refresh` with expired refresh token returns 401
- Duplicate email registration returns 409
- Rate limiting: 6th login attempt within 15 minutes returns 429

**API Gateway integration tests:**
- Request without JWT to protected route returns 401
- Request with expired JWT returns 401
- Request with valid JWT passes through to downstream service
- Correlation ID is generated if not provided, forwarded if provided

### Success Criteria

```
✓ POST /api/v1/auth/register returns 201
✓ POST /api/v1/auth/login returns 200 with accessToken in body
  and Set-Cookie with refreshToken HttpOnly cookie
✓ POST /api/v1/auth/refresh returns new accessToken
✓ Accessing any protected route without JWT returns 401
✓ Accessing any protected route with valid JWT passes through
✓ Token blocklist: logging out invalidates the access token immediately
✓ All unit and integration tests pass
✓ Auth Service /health/ready returns healthy PostgreSQL and Redis dependencies
✓ Traces for login flow appear in Jaeger UI
```

---

## Milestone 4: User Service & Profile Management

### Objective

User profiles exist and are kept in sync with authentication events. The KYC status workflow is in place. Internal user lookup works for downstream services.

### What You Build

**User Service (complete):**
- Migrations: `user_profiles`, `user_preferences`, `kyc_submissions`
- Consumer for `user.registered` → creates profile record
- Consumer for `user.email_verified` → logs event
- `GET /users/me` — own profile
- `PATCH /users/me` — update own profile
- `GET /users/:userId` — admin/support lookup
- `GET /users/internal/:userId` — service-to-service KYC check
- `GET /users` — paginated user list for admin
- Event publishing: `user.profile_updated`, `user.kyc_status_changed`
- Operations consumer: `operations.kyc_approved`, `operations.kyc_rejected`

**Shared middleware enhancement:**
Implement the internal API key middleware used by the `/internal/` routes across all services. Add it to `@fintech/shared-middleware`.

### Concepts Learned

- Event-driven profile creation (reacting to Auth Service events)
- Service-to-service authentication with internal API keys
- Cursor-based pagination implementation
- AsyncLocalStorage for context propagation across async chains
- Soft delete patterns with partial indexes

### Testing Requirements

- Unit: KYC status transition validation
- Integration: `user.registered` event consumption creates profile record
- Integration: duplicate `user.registered` event is idempotent (no duplicate profile)
- Integration: `GET /users/internal/:userId` returns 404 for non-existent user
- Integration: customer cannot access `GET /users/:userId` (returns 403)
- Integration: support agent can access `GET /users/:userId`

### Success Criteria

```
✓ Register a user via Auth Service → User profile exists in User Service database
✓ Same user.registered event delivered twice → only one profile exists (idempotency)
✓ GET /api/v1/users/me returns correct profile for authenticated user
✓ GET /users/internal/:userId with internal API key returns KYC status
✓ Customer role cannot access /users/:otherUserId
✓ All tests pass
```

---

## Milestone 5: Account Service

### Objective

Users can create financial accounts. Account status management is working. The account state machine is enforced. Internal account validation works for the Transfer Service.

### What You Build

**Account Service (complete):**
- Migrations: `accounts`, `account_status_history`, `account_limits`
- `POST /accounts` — create account (requires verified KYC via User Service call)
- `GET /accounts` — list own accounts
- `GET /accounts/:id` — get account details
- `DELETE /accounts/:id` — close account (requires zero balance via Ledger call)
- `POST /accounts/:id/freeze` — support agent or admin action
- `POST /accounts/:id/unfreeze` — admin only
- `GET /accounts/internal/:id` — service-to-service account lookup
- `GET /accounts/internal/validate` — pre-transfer validation
- Consumer: `user.kyc_status_changed` → freeze accounts if KYC suspended
- Events: `account.created`, `account.frozen`, `account.unfrozen`, `account.closed`
- Account number generation (ACC + 12 random digits, unique constraint enforced)

### Concepts Learned

- State machine enforcement at the application layer
- Cross-service validation via synchronous HTTP call (KYC check to User Service)
- Atomic upsert patterns (account number uniqueness with retry on collision)
- Status history as an append-only log within the service's own database

### Testing Requirements

- Unit: account status state machine transitions (valid and invalid)
- Unit: account number generation format validation
- Integration: creating an account calls User Service to check KYC status
- Integration: creating an account with `kycStatus: pending` returns 403
- Integration: freezing an already-frozen account returns 422
- Integration: unfreezing with customer role returns 403
- Integration: `account.created` event is published after account creation
- Integration: `user.kyc_status_changed` with `suspended` status freezes all user accounts

### Success Criteria

```
✓ POST /accounts creates account with unique account number
✓ Account creation requires KYC verified status
✓ Account status transitions: active → frozen → active (by admin) → closed
✓ Invalid transitions (closed → active) return 422
✓ All accounts for a user appear in GET /accounts
✓ account.created event appears in RabbitMQ after creation
✓ All tests pass
```

---

## Milestone 6: Ledger Service & Double-Entry Accounting

### Objective

The financial core of the system is working. Transactions can be posted with full double-entry validation. Balances can be queried. The accounting equation holds.

### What You Build

**Ledger Service (complete):**
- Migrations: `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `balance_snapshots`
- Migration: system accounts inserted (`SYS_SUSPENSE_TRANSFER`, `SYS_SUSPENSE_DEPOSIT`, `SYS_EXTERNAL_INFLOW`, `SYS_REVENUE_FEES`, `SYS_ADMIN_CREDIT_FACILITY`)
- Migration: revoke UPDATE and DELETE on `ledger_entries` for application database user
- Consumer: `account.created` → creates corresponding `ledger_accounts` record
- `POST /transactions` — post a balanced transaction (idempotent)
- `GET /accounts/:id/balance` — calculate balance from entries and snapshot
- `GET /accounts/:id/entries` — paginated ledger history
- `GET /transactions/:id` — full transaction with all entries
- `GET /reconciliation/summary` — total debits, total credits, difference
- Event publishing: `ledger.transaction.posted`, `ledger.reconciliation.completed`, `ledger.reconciliation.failed`

**Grafana dashboard: Financial Operations**
Create the first Grafana dashboard showing reconciliation status and ledger transaction volume.

### Concepts Learned

- Double-entry accounting implementation in SQL
- Database-level immutability via permission revocation
- Balance snapshot pattern for performance
- Cursor-based pagination for large result sets
- The reconciliation query pattern
- The `account.created` → `ledger_accounts` event-driven synchronisation

### Testing Requirements

**Unit tests:**
- Balance calculation: various debit/credit combinations
- Balance calculation with snapshot: only entries after snapshot are summed
- Transaction validation: entries must balance, amount must be positive
- Transaction validation: minimum two entries required

**Integration tests:**
- Valid balanced transaction is accepted and stored
- Unbalanced transaction is rejected (422)
- Transaction that would make balance negative is rejected (422)
- Duplicate idempotency key returns 409 with original transaction ID
- Balance is correctly calculated after multiple transactions
- `account.created` event creates ledger account (idempotent for duplicates)
- Reconciliation summary returns difference of zero after balanced postings
- `ledger_entries` cannot be updated (database permission test)

### Success Criteria

```
✓ POST /ledger/transactions with balanced entries returns 201
✓ POST /ledger/transactions with unbalanced entries returns 422
✓ GET /ledger/accounts/:id/balance returns correct balance
✓ GET /ledger/reconciliation/summary returns { difference: 0 }
✓ Posting the same transaction twice returns 409 on second attempt
✓ Direct SQL UPDATE on ledger_entries is rejected by database
✓ account.created event triggers ledger account creation
✓ All unit and integration tests pass
```

---

## Milestone 7: Deposit Service & First Money In

### Objective

Money can enter the system. Admin credits work. The complete flow from "no balance" to "has balance" is functional and verifiable through the ledger.

### What You Build

**Deposit Service (complete):**
- Migrations: `deposits`
- `POST /deposits` — initiate a deposit (simulated payment gateway)
- `POST /deposits/callback` — payment gateway callback (simulated)
- `POST /deposits/admin-credit` — admin direct credit (with mandatory reason)
- `GET /deposits/:id` — deposit status
- `GET /deposits` — deposit history
- Phase 1 and Phase 2 ledger posting logic
- Idempotency key handling
- Events: `deposit.initiated`, `deposit.completed`, `deposit.failed`, `deposit.admin_credit_applied`

**API Gateway route registration:**
Add Deposit Service routes to the gateway routing table.

**End-to-end flow verification:**
For the first time, the complete "user exists → account exists → has money" flow works.

### Concepts Learned

- Two-phase deposit accounting (suspense → customer account)
- Admin credit accounting (`SYS_ADMIN_CREDIT_FACILITY`)
- Payment gateway callback simulation and validation
- The moment where double-entry accounting becomes visible: checking the reconciliation summary after a deposit still shows `difference: 0`

### Testing Requirements

**Integration tests:**
- Admin credit: balance increases by credited amount
- Admin credit: `deposit.admin_credit_applied` event published with admin user ID
- Admin credit: mandatory reason field enforced
- Reconciliation: after admin credit, `difference` is still 0
- Duplicate admin credit with same idempotency key returns 409, does not credit twice
- Payment callback with wrong amount is rejected

**E2E test (first E2E test in the project):**
```
Register user → verify email → login →
create account → admin credit ₹5000 →
GET balance → assert balance = 500000 paise →
GET reconciliation → assert difference = 0
```

### Success Criteria

```
✓ Admin credit increases account balance correctly
✓ Balance after credit is visible via GET /ledger/accounts/:id/balance
✓ Reconciliation difference remains 0 after every operation
✓ Duplicate idempotency key does not double-credit
✓ First E2E test passes end-to-end
✓ Deposit.completed event consumed by Notification Service (which is started
  but only logs events at this milestone — full notification in Milestone 9)
```

---

## Milestone 8: Transfer Service & The Saga

### Objective

Money can move between accounts. The complete Saga — Phase 1, Phase 2, and compensation — is implemented and verified. This is the most technically complex milestone in the entire project.

### What You Build

**Transfer Service (complete):**
- Migrations: `transfers`, `transfer_saga_events`, `daily_transfer_totals`
- `POST /transfers` — initiate transfer (with idempotency key)
- `GET /transfers` — transfer history (own, or all for admin)
- `GET /transfers/:id` — transfer detail with saga step history
- Complete saga orchestration: validation → Phase 1 → Phase 2 → completion
- Compensation logic: Phase 2 failure → reversal → `REVERSED` or `REVERSAL_FAILED`
- Saga recovery on service restart (scans non-terminal transfers)
- Daily transfer limit check with atomic upsert
- Circuit breakers on all outbound HTTP calls
- Events: all transfer events from Chapter 7

**Transfer-related E2E tests:**
The critical financial E2E tests covering happy path and failure scenarios.

### Concepts Learned

- Saga orchestration implementation in Node.js
- The saga state machine as a database status field
- Saga recovery on restart by scanning non-terminal records
- Compensation transactions in double-entry accounting
- Circuit breaker implementation with `opossum` library
- Atomic daily limit check with `INSERT ... ON CONFLICT ... WHERE` pattern
- The moment of truth: seeing Phase 1 and Phase 2 entries in the ledger after a successful transfer

### Testing Requirements

**Unit tests:**
- Saga state machine: all valid and invalid transitions
- Compensation entry construction: reversal entries are exact inverse of Phase 1 entries
- Daily limit check logic
- Transfer validation rules (amount positive, accounts different, etc.)

**Integration tests:**
- Successful transfer: Phase 1 and Phase 2 ledger transactions exist
- Successful transfer: source balance decreased, destination balance increased
- Failed transfer (insufficient funds): no ledger entries created
- Failed transfer (account frozen): no ledger entries created
- Saga compensation: Phase 2 failure results in Phase 1 reversal
- Saga compensation: source balance restored after reversal
- Duplicate idempotency key: second request returns 409, no duplicate transfer
- Daily limit: transfer that would exceed daily limit is rejected

**E2E tests:**
- Complete transfer happy path (from Milestone 8 E2E design in Chapter 13)
- Insufficient funds E2E test
- Post-transfer reconciliation assertion

### Success Criteria

```
✓ Transfer completes: source balance decreases, destination balance increases
✓ Ledger shows Phase 1 and Phase 2 transactions for each transfer
✓ Compensation: if Phase 2 fails, source balance is restored via reversal
✓ Suspense account balance is 0 after every completed or reversed transfer
✓ Reconciliation difference remains 0 after all operations
✓ All saga states are reachable through tests
✓ Service restart with in-flight saga: saga resumes correctly
✓ All unit, integration, and E2E tests pass
✓ Transfer saga duration appears in Grafana dashboard
```

---

## Milestone 9: Notification Service & Audit Service

### Objective

Users are informed of financial events. Every significant action is recorded in an immutable audit log. The system is fully observable from a business perspective.

### What You Build

**Notification Service (complete):**
- Migrations: `notifications`, `notification_templates`, `user_notification_cache`
- Consumers for all events that trigger notifications (from the channel matrix in Chapter 8)
- Consumer for `user.registered` and `user.profile_updated` → update local cache
- Email delivery (use a test SMTP server like **Mailhog** locally)
- In-app notification record creation
- Notification history endpoint: `GET /notifications`
- Retry logic for failed deliveries
- Events: `notification.sent`, `notification.failed`

**Audit Service (complete):**
- Migration: `audit_logs`, `audit_log_access`
- Wildcard consumer binding (`#` on all exchanges) → write audit records
- `GET /audit/logs` — paginated audit log search
- `GET /audit/logs/correlation/:correlationId` — full request journey
- `GET /audit/summary` — aggregate statistics
- Database-level INSERT-only enforcement

**Grafana dashboard: Audit & Notifications**
Dashboard showing notification delivery rates and audit log volume.

### Concepts Learned

- Local data cache maintained via event consumption (Notification Service's user cache)
- Wildcard exchange bindings in RabbitMQ
- Append-only database tables with permission enforcement
- The complete event chain: a transfer generates events that trigger notifications and audit records across three separate services
- Mailhog for local email testing

### Testing Requirements

**Notification Service:**
- `transfer.completed` event → notification record created for both account owners
- Duplicate event (same `event_id`) → only one notification created (idempotency)
- User with `email_enabled: false` → email notification skipped
- Failed email delivery → notification status `failed`, retry attempted

**Audit Service:**
- Every event consumed → audit log record created
- Duplicate event → only one audit record (idempotency via `event_id` unique constraint)
- `GET /audit/logs/correlation/:id` → returns all audit events for that request
- Direct SQL UPDATE on `audit_logs` is rejected (database permission test)

### Success Criteria

```
✓ Complete a transfer → notification email appears in Mailhog UI
✓ Notification record exists in notification_db with status 'sent'
✓ Audit log has records for: transfer initiated, Phase 1, Phase 2, completed
✓ GET /audit/logs/correlation/:correlationId returns the complete transfer journey
✓ Audit log immutability: direct SQL UPDATE rejected
✓ Idempotency: duplicate events do not create duplicate notifications or audit records
✓ All tests pass
```

---

## Milestone 10: Approval Service & Scheduler Service

### Objective

Large transfers require human approval. Scheduled transfers execute at the right time. System maintenance tasks run automatically.

### What You Build

**Approval Service (complete):**
- Migration: `approval_requests`
- Integration with Transfer Service saga (Transfer Service creates approvals, resumes on decision)
- `POST /approvals` — internal endpoint for Transfer Service
- `GET /approvals` — manager/admin queue
- `POST /approvals/:id/approve` — with self-approval guard
- `POST /approvals/:id/reject` — with mandatory reason
- Events: all approval events

**Scheduler Service (complete):**
- Migration: `scheduled_tasks`
- The 30-second scheduling loop with Redis distributed locking
- All system maintenance task types
- `POST /schedules` — schedule a transfer
- `GET /schedules` — list user's schedules
- `DELETE /schedules/:id` — cancel a schedule
- Events: all schedule events
- Task: `approval_expiry_check` → publishes event consumed by Approval Service

**Transfer Service enhancement:**
- Consume `approval.approved` and `approval.rejected` events to resume or fail sagas
- Handle `schedule.transfer_due` event to process scheduled transfers

### Concepts Learned

- Redis distributed locking with `SET NX PX` (set if not exists with TTL)
- Saga pause and resume via event-driven communication
- The self-approval guard as a business rule enforcement
- Scheduled task state machine and retry with backoff
- Inter-saga coordination: Transfer Service saga waiting for Approval Service

### Testing Requirements

- Transfer over approval threshold creates approval request
- Approval Service `POST /approve` by the requester returns 403
- Approval → Transfer Service saga resumes → transfer completes
- Rejection → Transfer Service saga fails → transfer status `failed`
- Approval expiry: pending approval past `expires_at` transitions to `expired`
- Scheduled task: task runs once even when two Scheduler instances exist (distributed lock test)
- Scheduled transfer fires at correct time and initiates transfer saga

**E2E test:**
Large transfer approval flow (from Chapter 13 Scenario 3).

### Success Criteria

```
✓ Transfer of ₹150,000 creates approval request and transfer status is pending_approval
✓ Manager can approve → transfer completes
✓ Manager cannot approve own transfer (403)
✓ Approval expiry transitions to expired and transfer fails
✓ Scheduled transfer executes at the correct time
✓ Two Scheduler instances: each task executes exactly once (verified via audit log)
✓ All E2E tests pass
✓ All tests pass
```

---

## Milestone 11: Operations Service & Admin Tooling

### Objective

Administrators have a complete set of tools for managing the platform. The system is operationally complete.

### What You Build

**Operations Service (complete):**
- Admin credit endpoint (delegates to Deposit Service)
- User role management: `PATCH /ops/users/:id/role`
- KYC approval and rejection: `POST /ops/users/:id/kyc/approve`
- DLQ management: `GET /ops/dlq`, `POST /ops/dlq/:queue/requeue`, `DELETE /ops/dlq/:queue/messages`
- System health dashboard endpoint: `GET /ops/health` (aggregates health from all services)
- Reconciliation trigger: `POST /ops/reconciliation/run`
- Saga recovery trigger: `POST /ops/sagas/recover`
- Emergency halt: `POST /ops/emergency-halt`, `DELETE /ops/emergency-halt`
- System metrics summary: `GET /ops/system-metrics`
- Event publishing: `operations.kyc_approved`, `operations.kyc_rejected`, `operations.user_suspended`

**Emergency halt integration:**
Add halt check to Transfer Service and Deposit Service request pipeline.

**Grafana: Operations Dashboard:**
The complete operations dashboard from Chapter 10 — DLQ depths, reconciliation status, in-flight sagas, system health aggregate.

### Concepts Learned

- Aggregate health checks across multiple services
- DLQ inspection and management
- Emergency halt with Redis-based flags
- Operations service as a thin orchestrator over other services

### Testing Requirements

- Admin credit via Operations Service → balance increases → audit log records admin action
- KYC approval publishes `operations.kyc_approved` → User Service updates status
- Emergency halt: new transfers return 503 after halt activated
- Emergency halt: lift → transfers succeed again
- DLQ requeue: messages move from DLQ back to original queue
- System health endpoint: returns degraded if any service's readiness probe fails

### Success Criteria

```
✓ Admin credit flow works end-to-end with audit trail
✓ KYC approval updates user's KYC status
✓ Emergency halt blocks new financial operations
✓ Operations dashboard shows all service health statuses
✓ DLQ management tool successfully requeues messages
✓ All tests pass
```

---

## Milestone 12: Reporting Service & Financial Dashboards

### Objective

Auditors and managers have access to financial reports. The system's financial health is visible in Grafana.

### What You Build

**Reporting Service (complete):**
- Consumes `transfer.completed`, `deposit.completed`, `ledger.transaction.posted` events
- Maintains local aggregated reporting tables (daily transaction summaries, account statistics)
- `GET /reports/transactions` — filtered transaction report for auditors
- `GET /reports/account-summary` — account balance summaries
- `GET /reports/daily-volume` — daily transfer volume with amounts
- `GET /reports/reconciliation-history` — history of reconciliation results

**Grafana: Financial Dashboard (complete):**
The complete financial operations dashboard — transfer volume, success rates, deposit totals, reconciliation history.

### Concepts Learned

- CQRS (Command Query Responsibility Segregation) in practice: the Reporting Service is the read model — it maintains denormalised, query-optimised views of data that is written by the operational services
- Event-driven read model updates
- Reporting database design for analytical queries (different from operational database design)

### Testing Requirements

- `transfer.completed` event → reporting tables updated
- Daily volume report reflects all transfers in the date range
- Report query filters work correctly (by date, by account, by status)
- Reconciliation history shows all past reconciliation results

### Success Criteria

```
✓ Transfer volume report shows correct totals
✓ Grafana Financial Dashboard displays live data
✓ Auditor role can access reports; customer role cannot
✓ All tests pass
```

---

## Milestone 13: Complete Observability & Alerting

### Objective

The system is fully observable. Every alert is configured. Runbooks are written. The system can be diagnosed and recovered from production incidents.

### What You Build

**Complete Prometheus metrics:**
Every metric from the catalog in Chapter 10 is emitted by every service. Verify this by querying Prometheus for each metric name.

**Complete Grafana dashboards:**
- System Overview Dashboard (all services, Four Golden Signals)
- Financial Operations Dashboard (transfer metrics, reconciliation)
- Service Deep-Dive Dashboard (per-service detailed metrics)
- Operations Dashboard (DLQ depths, saga states, system health)

**Alerting rules:**
All alert definitions from Chapter 10 configured in Prometheus. Alertmanager configured to send alerts to a local webhook for testing.

**Runbooks:**
Write the complete runbooks for:
- Elevated transfer failure rate
- Ledger reconciliation failure
- DLQ accumulation
- Service unavailability
- Saga stuck in non-terminal state

**Distributed traces:**
Verify that every significant user flow (login, create account, transfer, deposit) produces a complete trace visible in Jaeger.

### Concepts Learned

- PromQL (Prometheus Query Language) for building alert conditions and dashboard panels
- Alertmanager routing and notification configuration
- Trace sampling strategies (trace everything in development, sample in production)
- Operational documentation as a first-class engineering artifact

### Success Criteria

```
✓ Every metric in Chapter 10's catalog appears in Prometheus
✓ All four Grafana dashboards display correct data
✓ All critical alerts fire correctly when conditions are met (test in staging)
✓ Complete transfer trace visible in Jaeger from gateway to all downstream services
✓ All runbooks written and reviewed
```

---

## Milestone 14: Kubernetes Deployment & Production Readiness

### Objective

The complete system runs in Kubernetes. Zero-downtime deployments work. Health probes function correctly. The system is deployable to a production-like environment.

### What You Build

**Complete Kubernetes manifests:**
Every Deployment, Service, ConfigMap, Secret, HPA, and PodDisruptionBudget from Chapter 12 for all thirteen services and infrastructure components.

**Kustomize overlays:**
Local, staging, and production overlays with appropriate patches.

**Local Kubernetes testing:**
The complete system running in k3d, with all services healthy and all E2E tests passing against the Kubernetes deployment.

**CI/CD pipeline:**
Complete GitHub Actions pipelines for CI (lint, typecheck, test) and CD (build, push, deploy to staging).

**Graceful shutdown verification:**
Verify that rolling deployments produce zero dropped requests (test with a running k6 load test while deploying a new version).

**Resource tuning:**
Configure resource requests and limits based on observations from Milestone 13's load tests.

### Concepts Learned

- Kubernetes manifest authoring for production services
- Kustomize overlay strategy
- PodDisruptionBudgets for safe cluster maintenance
- GitHub Actions for CI/CD
- Zero-downtime rolling deployment verification
- Resource request and limit calibration

### Success Criteria

```
✓ kubectl apply -k k8s/overlays/local/ deploys all services successfully
✓ All service pods reach Running state with ready status
✓ All E2E tests pass against the Kubernetes deployment
✓ Rolling deployment of Transfer Service: zero dropped requests during update
✓ Horizontal scaling: HPA scales API Gateway under simulated load
✓ CI pipeline runs all tests on every PR
✓ CD pipeline deploys to staging on merge to main
```

---

## Milestone 15: Load Testing, Chaos Testing & Hardening

### Objective

The system is verified to handle production-scale load correctly and to recover from failure scenarios without data loss. This milestone confirms that the system deserves to be called production-grade.

### What You Build

**k6 load test suite (complete):**
All four load test scenarios from Chapter 13: sustained normal load, transfer-specific load, spike test, endurance test. All tests pass their defined thresholds.

**Chaos test execution:**
Execute and document the results of all critical chaos scenarios from Chapter 13:
- Service crash during saga execution (funds_reserved state)
- Database connectivity loss during transfer
- RabbitMQ disconnection and reconnection
- Duplicate event injection
- DLQ poison message

**Performance optimisations (based on load test findings):**
Whatever the load tests reveal — balance snapshot tuning, database query optimisation, connection pool sizing, HPA threshold adjustment.

**Security hardening:**
- Verify that no service database is accessible from outside its own service
- Verify internal API keys are different per service
- Verify audit logs cannot be tampered with
- Run a dependency vulnerability scan (`pnpm audit`)
- Verify all secrets are Kubernetes Secrets, not ConfigMaps
- Verify no sensitive data appears in any log line

**Final E2E regression suite:**
The complete E2E test suite from Chapter 13, all passing, run against the Kubernetes deployment.

### Concepts Learned

- Load test result analysis and performance diagnosis
- Chaos engineering methodology
- Security hardening checklist for financial systems
- The difference between "it works" and "it is production-grade"

### Success Criteria

```
✓ Sustained normal load (50 VUs, 10 minutes): P95 < 500ms, error rate < 1%
✓ Transfer load (10 VUs, 5 minutes): P99 < 3s, error rate < 0.1%
✓ Spike test (200 VUs): system survives and recovers
✓ Endurance test (2 hours): no memory growth, no latency drift
✓ Chaos: saga recovery after service crash — no money lost
✓ Chaos: duplicate event — processed exactly once
✓ Chaos: RabbitMQ reconnection — no messages lost
✓ Reconciliation difference = 0 after all chaos tests
✓ pnpm audit shows no high or critical vulnerabilities
✓ All E2E tests pass against Kubernetes deployment
✓ All 15 milestones complete: system is production-grade
```

---

### 14.2 The Milestone Dependency Graph

Some milestones must be completed in order. Others can be parallelised if working with a team. For a solo developer, the linear sequence above is the recommended order.

```
M1 (Infrastructure)
  ↓
M2 (Shared Packages)
  ↓
M3 (Auth + Gateway) ─────────────────────────────────┐
  ↓                                                   │
M4 (User Service)                                    │
  ↓                                                   │
M5 (Account Service)                                 │
  ↓                                                   │
M6 (Ledger Service) ──────────────────────┐          │
  ↓                                       │          │
M7 (Deposit Service)                      │          │
  ↓                                       │          │
M8 (Transfer Service) ◄───────────────────┘          │
  ↓                                                   │
M9 (Notification + Audit) ◄──────────────────────────┘
  ↓
M10 (Approval + Scheduler)
  ↓
M11 (Operations)
  ↓
M12 (Reporting)
  ↓
M13 (Observability)
  ↓
M14 (Kubernetes)
  ↓
M15 (Load + Chaos)
```

---

### 14.3 What Each Milestone Teaches

Looking at the roadmap from a learning perspective, the milestones teach concepts in this progression:

**Milestones 1–2**: Tooling mastery. Monorepo management. TypeScript at scale. Shared library design.

**Milestone 3**: Security fundamentals. JWT, asymmetric cryptography, session management, Redis.

**Milestones 4–5**: Event-driven data synchronisation. Service boundaries. RBAC enforcement.

**Milestone 6**: Double-entry accounting implemented in real software. Database immutability. Financial invariants.

**Milestone 7**: The first real money movement. Two-phase accounting. Idempotency in practice.

**Milestone 8**: The hardest milestone. Distributed saga orchestration. Compensation. Recovery. Circuit breakers. The complete picture of why distributed transactions are hard and how to handle them correctly.

**Milestone 9**: Event-driven side effects. Immutable audit logs. The observable trail of financial events.

**Milestone 10**: Approval workflows. Distributed scheduling. Saga coordination across services.

**Milestones 11–12**: Operations and reporting. The administrative and analytical faces of the system.

**Milestone 13**: Observability as engineering practice. PromQL. Distributed tracing end-to-end.

**Milestone 14**: Production infrastructure. Kubernetes. CI/CD. Zero-downtime deployments.

**Milestone 15**: The graduation milestone. Does the system work under real conditions? Does it recover from real failures? Is money safe?

---

### Key Concepts — Chapter 14

- Every milestone produces a working system. Never advance to the next milestone with failing tests.
- The milestone sequence is ordered by dependency, not by complexity. Infrastructure before services, simple services before complex ones.
- Milestone 8 (Transfer Service + Saga) is the hardest and most educational milestone. Allocate extra time.
- The reconciliation assertion (`difference = 0`) appears in every E2E test from Milestone 7 onwards. It is the system's financial health indicator.
- Observability is introduced in Milestone 3 (OpenTelemetry setup) and grown through every subsequent milestone. It is not a final step.
- Load and chaos tests in Milestone 15 are the proof that the system is production-grade. They are not optional.

---

## Chapter 15: Future Services, Extension Points & Closing Thoughts

---

### 15.1 Designing for a Future You Cannot Fully Predict

One of the most revealing tests of an architecture is not what it can do today, but how easily it absorbs new capabilities tomorrow. A brittle architecture treats every new requirement as a disruptive change — schema alterations that touch many tables, new dependencies that tighten coupling, new features that can only be added by modifying existing services. A well-designed architecture treats new requirements as additive — a new service plugs in, subscribes to existing events, exposes new endpoints, and the existing system barely notices.

The system you have built across these fourteen chapters has been designed with extensibility as a first-class property. The database-per-service pattern means no new service contaminates existing data models. The event-driven architecture means existing services do not need to know about new consumers. The shared type system means new services speak the same language immediately. The API Gateway's routing table means new services are exposed without touching any other service's code.

This chapter examines five planned future services, explains exactly how each one plugs into the existing system, and identifies every extension point that must be designed now — even though the service itself will not be built yet. It then closes with the broader perspective on what building this system teaches and where it points.

---

## Part A: Future Service Designs

### 15.2 Future Service 1: The Fraud Detection Service

#### Why It Exists

Every financial platform is a target for fraud. Fraudulent transfers, account takeovers, money mule schemes, and velocity attacks are routine occurrences at any platform with significant transaction volume. Fraud detection is not a feature — it is a survival requirement.

The Fraud Detection Service analyses patterns across transactions, logins, and account activity to identify suspicious behaviour in real time and flag or block it before money moves.

#### How It Plugs Into the Existing System

The Fraud Detection Service is a **pure consumer** in the current event architecture. It subscribes to events but does not need to produce any new events for the existing services to function. Existing services do not need to know the Fraud Detection Service exists.

However, the Transfer Service needs to be enhanced to **pause before Phase 1** and request a fraud score. This is the one synchronous integration point:

```
New step in Transfer Saga (between validation and Phase 1):

Step 6.5: Fraud Check
  Transfer Service calls Fraud Detection Service:
    POST /fraud/evaluate
    Body: { transferId, sourceAccountId, destinationAccountId,
            amount, initiatedBy, deviceFingerprint, ipAddress }
  
  Response cases:
    { decision: 'allow' }
      → Continue to Phase 1 normally
    
    { decision: 'review', fraudScore: 0.73, reasons: [...] }
      → Create an approval request (like large transfer approval)
        but with fraud_review as the request type
      → Pause saga in PENDING_FRAUD_REVIEW status
    
    { decision: 'block', fraudScore: 0.95, reasons: [...] }
      → Fail the transfer immediately
      → Publish transfer.blocked_by_fraud event
      → Optionally freeze the account pending investigation
```

The Transfer Service's saga status machine gains a new state: `PENDING_FRAUD_REVIEW`. The Approval Service's `request_type` enum gains `fraud_review`. These are the only changes to existing services.

#### What the Fraud Detection Service Consumes

```
user.logged_in               → track login patterns, device fingerprints
user.registered              → baseline user behaviour profile
transfer.completed           → update transaction velocity counters
transfer.failed              → note failed transfer attempts
account.frozen               → flag associated accounts for review
deposit.completed            → track deposit patterns
```

#### What the Fraud Detection Service Produces

```
fraud.evaluation_completed   → consumed by Transfer Service (resume or block)
fraud.alert_raised           → consumed by Audit Service, Operations Service
fraud.account_flagged        → consumed by Account Service (optional auto-freeze)
```

#### Data It Maintains

The Fraud Detection Service maintains its own database (`fraud_db`) with:

- **Velocity counters** — how many transfers has this account initiated in the last hour, day, week?
- **Behaviour profiles** — what are this user's normal transaction patterns (amounts, times, recipients)?
- **Device fingerprints** — which devices has this user logged in from?
- **IP reputation** — has this IP been associated with fraud before?
- **Known fraud indicators** — patterns identified from previous fraudulent activity

The fraud scoring model begins as a rules engine (if velocity > X and amount > Y and new recipient, score = high) and can graduate to a machine learning model as training data accumulates.

#### Extension Points to Design Now

Even though the Fraud Detection Service is not built in the initial project, the following must be designed now:

**In the Transfer Service:**
- Add `PENDING_FRAUD_REVIEW` to the `TransferStatus` type in `@fintech/shared-types`
- Add the fraud check step to the saga executor as a no-op that calls a configurable URL (or skips if `FRAUD_SERVICE_URL` is not set in the environment)
- Add `fraud_review_id` nullable column to the `transfers` table
- Reserve the routing key `transfer.blocked_by_fraud` in `@fintech/shared-events`

**In the Approval Service:**
- Add `fraud_review` to the `request_type` enum
- Add `fraud_score` and `fraud_reasons` columns to `approval_requests`

**In the API Gateway:**
- Reserve the `/api/v1/fraud/*` route prefix in the routing table

**In the Event Catalog:**
- Document `fraud.evaluation_completed`, `fraud.alert_raised`, and `fraud.account_flagged` payload schemas

This means adding the Fraud Detection Service later requires no breaking changes to existing services — only the addition of the new service and the activation of the previously no-op fraud check step in the Transfer Service.

---

### 15.3 Future Service 2: The Currency Service

#### Why It Exists

The current system is INR-only. As the platform grows to serve users in multiple countries or users who need to transact in foreign currencies, a Currency Service becomes necessary. It manages exchange rates, handles currency conversion, and ensures that cross-currency transfers are correctly accounted for.

#### How It Plugs In

Multi-currency is a deeper architectural change than fraud detection because it touches the Ledger Service's fundamental assumption: all amounts are in INR. The Currency Service's integration requires careful design.

**Exchange Rate Management:**
The Currency Service fetches and stores exchange rates from external providers. It exposes a simple internal API:

```
GET /currency/rates?from=INR&to=USD&amount=50000
Response: {
  fromCurrency: 'INR',
  toCurrency: 'USD',
  fromAmount: 50000,        // in paise
  toAmount: 67,             // in USD cents
  rate: 0.01206,
  rateId: 'rate-xyz',       // used to lock in the rate
  expiresAt: string         // rate valid for 30 seconds
}

POST /currency/lock-rate
Body: { rateId, transferId }
Response: { locked: true, lockedUntil: string }
```

**Transfer Service Enhancement:**
For cross-currency transfers, the Transfer Service:
1. Gets a rate quote from the Currency Service
2. Locks the rate (valid for 30 seconds)
3. Adds an additional saga step: currency conversion
4. Phase 1 debits source account in source currency
5. New Phase 1.5: conversion entry records the exchange
6. Phase 2 credits destination account in destination currency

**Ledger Service Enhancement:**
The most significant change. The `ledger_accounts` table already has a `currency` column. The `ledger_entries` table has a `currency` column. These were designed in Chapter 6 specifically for this future requirement. The enhancement needed:
- Support for posting transactions where entries have different currencies
- A new system account: `SYS_FX_GAIN_LOSS` (for rounding differences in exchange)
- Currency-aware balance calculation

**New Ledger Entry for a Cross-Currency Transfer (INR → USD):**
```
Transaction: "Cross-currency transfer — INR to USD"

Entry 1: CREDIT alice_wallet_inr       50000 paise
Entry 2: DEBIT  SYS_SUSPENSE_TRANSFER  50000 paise

[Currency Service locks exchange rate: 50000 paise = 67 USD cents]

Entry 3: CREDIT SYS_SUSPENSE_TRANSFER  50000 paise
Entry 4: DEBIT  SYS_FX_GAIN_LOSS       <rounding adjustment>
Entry 5: DEBIT  bob_wallet_usd         67 USD cents
```

The accounting still balances in the system's base currency (INR) once FX adjustments are applied.

#### Extension Points to Design Now

**In `@fintech/shared-types`:**
- `AccountCurrency` type is already `'INR'` — change it to `string` now, with a comment: "Currently INR only. Will expand when Currency Service is added."
- `LedgerEntry.currency` column already exists — no schema change needed

**In the Ledger Service:**
- Keep the `currency` column on `ledger_entries` populated correctly from day one
- Do not hardcode `'INR'` anywhere in balance calculation logic — parameterise it

**In the Event Catalog:**
- Reserve `currency.rate_updated`, `currency.rate_locked`, `currency.conversion_completed`

**In the API Gateway:**
- Reserve `/api/v1/currency/*` route prefix

---

### 15.4 Future Service 3: The External Bank Integration Service

#### Why It Exists

A closed-loop payment system — where users can only transact with other users on the same platform — has limited utility. Real financial platforms integrate with the external banking system: NEFT, RTGS, IMPS, and UPI in India. This allows users to send money to bank accounts outside the platform and receive money from them.

#### How It Plugs In

The External Bank Integration Service is an **adapter** — it translates between the platform's internal event-driven model and the external banking system's protocols (which are typically synchronous, document-based, and operate on batch processing cycles with delays of minutes to hours).

**Outbound Flow (platform user → external bank account):**
```
User initiates transfer to external account
  → Transfer Service identifies destination as external (by account number format)
  → Transfer Service saga includes new step: external_transfer_initiation
  → External Bank Service receives event: external_transfer.requested
  → External Bank Service submits to banking network (NEFT/IMPS/UPI)
  → Banking network responds (immediately for IMPS/UPI, hours for NEFT)
  → External Bank Service publishes: external_transfer.completed or .failed
  → Transfer Service saga resumes
```

**Inbound Flow (external bank → platform user):**
```
Banking network sends callback to External Bank Service
  → External Bank Service validates the callback
  → External Bank Service creates a deposit via Deposit Service
  → Normal deposit flow from there
```

**Account Number Extension:**
External accounts are referenced by their bank account number and IFSC code, not by the platform's internal account ID. The External Bank Integration Service maintains its own database of registered external accounts:

```
Database: external_bank_db
Table: external_accounts
  id                UUID
  owner_id          UUID (platform user)
  bank_name         VARCHAR
  account_number    VARCHAR (encrypted at rest)
  ifsc_code         VARCHAR
  account_holder    VARCHAR
  verification_status  ENUM (unverified, verified, failed)
  verified_at       TIMESTAMPTZ
```

#### Extension Points to Design Now

**In the Transfer Service:**
- The `destination_account_id` field currently assumes an internal account ID
- Add `destination_type ENUM('internal', 'external')` to the `transfers` table
- Add `external_account_id UUID` nullable column
- The saga executor already has the extensibility to add new steps — no structural change needed

**In the Deposit Service:**
- The `payment_method` column already has an extensible CHECK constraint — add `'external_bank_neft'`, `'external_bank_imps'`, `'upi'` as future values

**In `@fintech/shared-events`:**
- Reserve: `external_transfer.requested`, `external_transfer.completed`, `external_transfer.failed`
- Reserve: `upi.payment_received`, `bank.transfer_received`

**In the API Gateway:**
- Reserve `/api/v1/external-accounts/*` route prefix

---

### 15.5 Future Service 4: The Loan Service

#### Why It Exists

Lending is one of the most profitable financial services. A platform with a user base, transaction history, and KYC data is in a strong position to offer credit products — personal loans, buy-now-pay-later, overdraft facilities. The Loan Service manages the lifecycle of credit products: application, underwriting, disbursement, repayment, and default handling.

#### How It Plugs In

The Loan Service has a richer integration with the existing system than any other future service, because lending inherently involves multiple phases over extended time periods.

**Loan Disbursement (lending money to a user):**
```
Approved loan of ₹50,000 to Alice:

Ledger entries:
  DEBIT  alice_wallet               5000000 paise
  CREDIT SYS_LOAN_DISBURSEMENT      5000000 paise

The SYS_LOAN_DISBURSEMENT account's balance tracks total outstanding loans.
```

**Loan Repayment (user repaying the loan):**
```
Alice makes a ₹5,000 repayment:

Ledger entries:
  DEBIT  SYS_LOAN_REPAYMENT_PRINCIPAL  490000 paise  (principal portion)
  DEBIT  SYS_LOAN_REVENUE_INTEREST     10000 paise   (interest portion)
  CREDIT alice_wallet                  500000 paise

The interest goes to revenue. The principal reduces the outstanding loan.
```

**Loan Default:**
```
If Alice defaults:
  DEBIT  SYS_LOAN_LOSS_PROVISION       amount
  CREDIT SYS_LOAN_DISBURSEMENT         amount
  
This writes off the loan from the active loan balance to the loss provision account.
```

**Integration with Transfer Service:**
Loan repayments are processed through the Transfer Service — they are a transfer from the user's wallet to the loan repayment system account. This means the existing transfer limits and approval flows apply, which may need configuration exceptions for loan repayments.

**Integration with Scheduler Service:**
EMI (Equated Monthly Instalment) repayments are scheduled transfers. The Scheduler Service handles the recurring payment schedule. The Loan Service tells the Scheduler Service when each EMI is due.

**Integration with Reporting Service:**
Loan performance metrics (NPL ratio, outstanding loan book, interest income) are consumed by the Reporting Service from loan events.

#### Extension Points to Design Now

**In `@fintech/shared-types`:**
- Add `LedgerReferenceType` values: `'loan_disbursement'`, `'loan_repayment'`, `'loan_writeoff'`

**In the Ledger Service:**
- The `reference_type` column's CHECK constraint needs these new values added when the Loan Service is introduced
- System accounts `SYS_LOAN_DISBURSEMENT`, `SYS_LOAN_REVENUE_INTEREST`, `SYS_LOAN_LOSS_PROVISION` will be added via a new migration

**In the Scheduler Service:**
- The `task_type` column needs `'loan_emi_payment'` added when the Loan Service is introduced

**In `@fintech/shared-events`:**
- Reserve: `loan.application_submitted`, `loan.approved`, `loan.rejected`, `loan.disbursed`, `loan.repayment_received`, `loan.overdue`, `loan.defaulted`, `loan.closed`

---

### 15.6 Future Service 5: The Card Service

#### Why It Exists

A payment card (virtual or physical) tied to the user's platform wallet dramatically increases the utility of the platform. Users can spend their wallet balance anywhere cards are accepted. The Card Service manages card issuance, transaction authorisation, and settlement.

#### How It Plugs In

Card transactions have a unique property: they are **authorised first** (merchant checks if funds are available) and **settled later** (actual transfer happens hours or days later). This two-phase nature maps naturally to the platform's double-entry system but requires new concepts.

**Card Authorisation (funds reserved but not yet transferred):**
```
User taps card for ₹500 at a coffee shop:

Ledger entries (authorisation — funds reserved):
  CREDIT alice_wallet                 50000 paise
  DEBIT  SYS_CARD_AUTHORISATION      50000 paise

Alice's balance decreases immediately. The money is held in the card
authorisation account pending settlement.
```

**Card Settlement (actual transfer to merchant):**
```
When the merchant's bank settles (same day or next day):

Ledger entries (settlement):
  CREDIT SYS_CARD_AUTHORISATION      50000 paise
  DEBIT  SYS_CARD_SETTLEMENT_OUT     50000 paise

The authorisation clears and the money moves to the settlement account,
from which it will be paid out to the merchant's bank.
```

**Card Authorisation Reversal (if merchant cancels):**
```
If the coffee shop cancels the transaction:

Ledger entries (reversal):
  DEBIT  alice_wallet                 50000 paise
  CREDIT SYS_CARD_AUTHORISATION      50000 paise

Alice gets her money back. The authorisation account returns to zero.
```

**Integration with Account Service:**
Each card is linked to a specific account. The Card Service calls the Account Service to verify the account is active before authorising a transaction.

**Integration with Notification Service:**
Card transactions trigger immediate notifications: "Your card was used for ₹500 at Blue Tokai Coffee." These are high-priority notifications that should be delivered in under 30 seconds.

**The Authorisation Timeout Problem:**
If an authorisation is never settled (the merchant's terminal sent an authorisation but no sale was completed), the funds remain reserved indefinitely. The Scheduler Service handles this: a nightly job identifies authorisations older than 7 days with no settlement, reverses them, and returns the funds to the user's wallet.

#### Extension Points to Design Now

**In `@fintech/shared-types`:**
- Add `LedgerReferenceType` values: `'card_authorisation'`, `'card_settlement'`, `'card_reversal'`

**In `@fintech/shared-events`:**
- Reserve: `card.issued`, `card.transaction_authorised`, `card.transaction_settled`, `card.transaction_reversed`, `card.blocked`, `card.expired`

**In the Scheduler Service:**
- Reserve task type: `'card_authorisation_expiry'`

**In the Notification Service:**
- The notification template system already supports new event types — no structural change needed
- Add channel matrix entries for card events with high-priority SMS and push notification

---

## Part B: The Extension Point Registry

### 15.7 Maintaining the Extension Point Registry

As the system grows, it becomes important to document all the places where future services will integrate. This prevents the situation where a developer working on a future service discovers that a required column was never added, a required event type was never reserved, or a required route prefix is already being used by something else.

The Extension Point Registry is a document in `docs/architecture/extension-points.md`. It is updated whenever a new extension point is identified and reviewed before any future service begins development.

```markdown
# Extension Point Registry

## Fraud Detection Service
Status: NOT YET BUILT
Integration points:
- transfers table: fraud_review_id UUID (nullable) — column added in migration 010
- TransferStatus: 'pending_fraud_review' — added to shared-types
- approval_requests.request_type: 'fraud_review' — CHECK constraint updated
- Route prefix reserved: /api/v1/fraud/*
- Events reserved: fraud.evaluation_completed, fraud.alert_raised
- Environment variable: FRAUD_SERVICE_URL (optional — service skips check if absent)

## Currency Service
Status: NOT YET BUILT
Integration points:
- ledger_entries.currency: already present and populated correctly
- AccountCurrency type: uses string not literal type
- Route prefix reserved: /api/v1/currency/*
- Events reserved: currency.rate_updated, currency.rate_locked

[... one entry per future service ...]
```

---

## Part C: Architectural Lessons

### 15.8 What This System Taught You

By reaching this point — having designed and built a production-grade fintech platform — you have internalised a set of lessons that cannot be learned from reading alone. They must be built to be understood.

**Lesson 1: Boundaries are everything.**

The hardest decisions in this system were not about code — they were about where service responsibilities begin and end. The Auth Service does not own profiles. The Account Service does not calculate balances. The Ledger Service does not know about users. Each time you enforced a boundary strictly, the service on each side of it became simpler, more testable, and easier to reason about.

Blurring boundaries feels convenient in the short term. The User Service could have fetched account information directly from the account database. It would have saved an HTTP call. But six months later, when the Account Service needs to change its schema, you discover that the User Service was depending on a column that no longer exists. The savings were illusory. The boundary was real.

**Lesson 2: Events are how distributed systems breathe.**

The moment you internalised that the Auth Service publishes `user.registered` and the User Service reacts to it — rather than the Auth Service calling the User Service directly — the architecture opened up. New services can be added that react to existing events without modifying the producers. The Fraud Detection Service subscribes to `user.logged_in` without the Auth Service knowing or caring. This is loose coupling in practice, not in theory.

**Lesson 3: Failures are design inputs, not afterthoughts.**

Every saga step was designed with its failure mode before its happy path. What happens if Phase 1 succeeds but Phase 2 fails? That question was asked before Phase 1 was implemented. The compensation logic existed as a design before the saga executed a single transaction. This is the mental inversion required for resilient system design: assume failure, design for recovery, and treat success as the common case of a failure-aware system.

**Lesson 4: Double-entry accounting is a correctness mechanism.**

You could have built a simpler balance system. You could have had a `balance` column. It would have worked for 99% of transactions. The 1% — concurrent transfers, compensation after partial failure, reconciliation across services — would have revealed the limitation at the worst possible moment. Double-entry accounting is not over-engineering. It is the minimum viable correctness for financial data.

**Lesson 5: Observability is architecture, not tooling.**

Prometheus, Grafana, and Jaeger were introduced in Milestone 3 alongside the first service. Correlation IDs flow from the first HTTP request. This was not accidental. A system that is not observable from day one becomes progressively harder to make observable as it grows. Structured logging, metrics emission, and trace propagation are architectural decisions, implemented in shared middleware, enforced by the shared package system.

**Lesson 6: Tests are specifications.**

The testing milestone requirement — "every service must have unit and integration tests before you move to the next service" — is not about quality gatekeeping. It is about understanding. If you cannot write a test that verifies the ledger reconciliation holds after a failed transfer, you do not yet understand the compensation logic well enough to have built it correctly. Tests force precision.

---

### 15.9 How This Project Positions You Professionally

The skills demonstrated by building this system map directly to the concerns of senior backend engineers and staff engineers at fintech companies.

**You understand distributed systems trade-offs.** You can explain why database-per-service creates data duplication, why that is an accepted trade-off, and how eventual consistency is maintained through events. You can explain the CAP theorem in the context of real design decisions you made.

**You understand financial systems correctness requirements.** You can explain double-entry accounting, the purpose of the suspense account, how the accounting equation is maintained under concurrent operations, and what reconciliation is checking. These are not common knowledge among software engineers.

**You have implemented the patterns.** The Saga Pattern, circuit breakers, idempotency keys, distributed locking, event sourcing (in the audit log), CQRS (in the Reporting Service) — you have built implementations of all of these. You can discuss them from first principles, not just from having read about them.

**You understand operational requirements.** Health probes, graceful shutdown, rolling deployments, HPA configuration, DLQ management, runbooks — you have designed and implemented a system that is operable at production scale.

**You understand security in depth.** RS256 JWT verification, refresh token rotation with theft detection, bcrypt cost factors, the Redis blocklist, internal API key authentication, RBAC at both the gateway and service levels, immutable audit logs — these are the security mechanisms of real financial systems.

---

### 15.10 Where to Take This Further

This system is production-inspired but not production-deployed. The natural next steps:

**Deploy it.** Set up a cloud Kubernetes cluster (GKE, EKS, or AKS). Use an external secrets manager. Configure a production-grade PostgreSQL instance with point-in-time recovery. Run a real load test against the deployed system. Discover what the architecture looks like under real network conditions.

**Add the Fraud Detection Service.** This is the most educationally rich of the future services because it requires machine learning integration, real-time decision making, and careful calibration between false positives (blocking legitimate transactions) and false negatives (allowing fraudulent ones).

**Implement UPI integration.** The External Bank Integration Service with UPI is how real Indian fintech platforms operate. Understanding the NPCI's API, handling callback verification, and managing the asynchronous settlement cycle is a significant engineering challenge.

**Add event sourcing to the Ledger Service.** The current ledger is append-only but not a true event store. Implementing full event sourcing — where the current state is always derived from the complete event history, and historical states can be reconstructed by replaying events up to any point in time — is the logical evolution of the ledger design.

**Conduct a formal security review.** Hire or collaborate with a security engineer to conduct a penetration test and threat model review. Real fintech systems undergo regular third-party security audits. Understanding what a security review examines deepens your appreciation for what you built and what remains to be hardened.

---

### 15.11 The Document This Handbook Could Not Include

Every chapter in this handbook was written with one constraint: explain concepts before introducing them, and never assume the reader remembers what they knew years ago. That constraint produced a document that is thorough but necessarily incomplete.

What this handbook did not cover — and what your continued learning should address:

**Regulatory compliance in depth.** PCI-DSS, RBI's payment system regulations, GDPR implications for financial data, AML (Anti-Money Laundering) programme requirements. These are the legal and regulatory frameworks within which every technical decision in a real fintech company is made.

**Database replication and failover.** PostgreSQL streaming replication, automatic failover with Patroni or pg_auto_failover, and point-in-time recovery are essential production knowledge not covered here.

**Secret rotation.** How do you rotate a JWT signing key without invalidating all active user sessions? How do you rotate a database password without downtime? These operational procedures are complex and important.

**Multi-region deployment.** What happens when you need the system to serve users in multiple geographic regions with low latency? How do you handle data residency requirements? How does the ledger remain consistent across regions?

**Rate limiting sophistication.** The current rate limiting is per-user, per-IP, and Redis-backed. Production systems need more nuance: per-endpoint limits, adaptive limits that tighten under attack, and limits that account for the cost of different operations.

Each of these is a chapter-length topic. Each one is the subject of dedicated books and engineering blogs. The platform you have built is the foundation on which all of them can be explored.

---

### 15.12 Closing Thoughts

There is a moment that happens when you are building Milestone 8 — when you finally complete a transfer, the suspense account drains to zero, Alice's balance is ₹500 less, Bob's balance is ₹500 more, and the reconciliation query returns `difference: 0`. You understand, viscerally and not just intellectually, why double-entry accounting has survived for five hundred years. The system cannot lose money. The mathematics will not allow it.

That moment of understanding — where abstract concepts become concrete reality through the act of building — is what this handbook was designed to produce.

The thirteen services, the ten databases, the event catalog, the Saga Pattern, the Kubernetes manifests, the Grafana dashboards — none of these are the point. They are the vehicle. The point is that you now understand how production financial systems think about correctness, how distributed systems fail and recover, and how a well-designed architecture absorbs change without breaking under it.

That understanding does not expire. The specific technologies — the versions of RabbitMQ, the Kubernetes API groups, the TypeScript compiler flags — will change. The principles will not. Separation of concerns will not become wrong. Immutable audit logs will not become unnecessary. Idempotency will not stop mattering.

Build the system. Debug the failures. Fix the sagas. Watch the reconciliation pass. That is the education.

---

### Key Concepts — Chapter 15

- Well-designed architectures are additive — new services plug in without breaking existing ones.
- The Fraud Detection Service is a pure consumer that requires one synchronous integration point in the Transfer Service saga, designed as a no-op extension from the start.
- The Currency Service is enabled by design decisions already made: the `currency` column on ledger entries and the non-literal `AccountCurrency` type.
- The External Bank Integration Service is an adapter between the platform's event model and external banking protocols.
- The Loan Service uses the existing ledger's system accounts and the Scheduler Service's task infrastructure.
- The Card Service introduces two-phase card authorisation which maps cleanly to the suspense account pattern already established.
- Extension points must be registered and designed before the service that uses them is built.
- The core lessons — boundaries, events, failure-first design, double-entry correctness, observability as architecture, tests as specifications — are the permanent takeaways from this project.
- Deploy it. The system working locally and the system working under real production conditions are different things. Both are worth understanding.

---

## Appendix: Complete Event Catalog Reference

For quick reference, here is the complete event catalog for the system as built.

```
Exchange: fintech.transfers
  transfer.requested
  transfer.pending_approval
  transfer.completed
  transfer.failed
  transfer.reversed
  transfer.reversal_failed

Exchange: fintech.accounts
  account.created
  account.frozen
  account.unfrozen
  account.closed

Exchange: fintech.ledger
  ledger.transaction.posted
  ledger.reconciliation.completed
  ledger.reconciliation.failed

Exchange: fintech.deposits
  deposit.initiated
  deposit.completed
  deposit.failed
  deposit.admin_credit_applied

Exchange: fintech.users
  user.registered
  user.email_verified
  user.logged_in
  user.password_changed
  user.suspended
  user.profile_updated
  user.kyc_status_changed

Exchange: fintech.approvals
  approval.created
  approval.approved
  approval.rejected
  approval.expired

Exchange: fintech.notifications
  notification.sent
  notification.failed

Exchange: fintech.scheduler
  schedule.created
  schedule.transfer_due
  schedule.executed
  schedule.failed
  schedule.cancelled
  schedule.approval_expiry_check
  schedule.reconciliation_due

Exchange: fintech.operations
  operations.kyc_approved
  operations.kyc_rejected
  operations.user_suspended
  operations.emergency_halt_activated
  operations.emergency_halt_lifted

Reserved for future services:
  fraud.evaluation_completed
  fraud.alert_raised
  fraud.account_flagged
  currency.rate_updated
  currency.rate_locked
  currency.conversion_completed
  external_transfer.requested
  external_transfer.completed
  external_transfer.failed
  loan.application_submitted
  loan.approved
  loan.disbursed
  loan.repayment_received
  loan.defaulted
  card.issued
  card.transaction_authorised
  card.transaction_settled
  card.transaction_reversed
```

---

## Appendix: Architecture Decision Records Summary

The complete list of ADRs that should exist in `docs/architecture/adr/` upon project completion:

```
001 — Monorepo with pnpm workspaces over polyrepo
002 — Database-per-service pattern
003 — Double-entry accounting over balance column
004 — Orchestrated saga over choreographed saga for transfers
005 — Asymmetric JWT (RS256) over symmetric (HS256)
006 — Refresh token rotation with theft detection
007 — Redis blocklist for immediate access token invalidation
008 — Cursor-based pagination over offset pagination
009 — BIGINT paise over DECIMAL for monetary amounts
010 — RabbitMQ topic exchanges over direct exchanges
011 — At-least-once delivery with idempotent consumers
012 — Exponential backoff with jitter for retry strategy
013 — Circuit breakers on all synchronous service calls
014 — Append-only audit log with database-level permission enforcement
015 — Kustomize overlays over Helm for environment configuration
016 — OpenTelemetry over vendor-specific instrumentation
017 — Balance snapshots for ledger query performance
018 — Emergency halt via Redis flag over Kubernetes scaling to zero
019 — Internal API keys for service-to-service auth over mTLS
020 — AsyncLocalStorage for correlation context propagation
```

---

*This concludes The Fintech Platform Architecture Handbook.*

*Fifteen chapters. Thirteen services. Ten databases. One financial system built correctly from first principles.*

*Now build it.*
