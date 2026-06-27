# @fintech/shared-config

A highly strict runtime configuration and routing registry workspace module. It serves as the single source of truth across the monorepo to solve two distinct distributed system failure modes: silent environment degradation on startup and structural URL route drift across services.

---

## 🛠️ Architectural Rationale & Design Patterns

### 1. Fail-Fast Infrastructure Bootstrapping

In microservices architectures, missing or malformed configuration variables (e.g., a misspelled database connection URL, or an out-of-bounds integer string for a thread-pool size) are frequently missed during deployment pipelines. If a service initializes successfully despite these missing values, it will eventually experience severe failures at runtime when the execution path hits that specific configuration variable.

To prevent this, this package provides a strict schema layer that executes **on boot**. If `process.env` does not perfectly match the expected Zod criteria, the engine intercepts the execution path, logs a detailed error object to `stderr`, and explicitly invokes:

```typescript
process.exit(1);
```

This forces the container orchestrator (Kubernetes) to immediately mark the pod lifecycle as broken (`CrashLoopBackOff`), preventing broken workloads from entering traffic routing meshes.

### 2. Decoupled Hybrid Prefix Routing Contracts

Hardcoding raw endpoint string values (like `http://transfer-service/v1/initiate`) across different workspaces introduces major integration liabilities and causes route breakage during api version updates.

This package establishes a **Hybrid Routing Contract**:

- **The API Gateway** references `ApiRoutes.Prefixes` to establish top-level path proxies (e.g., everything starting with `/transfers` is proxied directly down to the internal network boundary of the `transfer-service`).
- **The Downstream Services** import `ApiRoutes` to build and mount their localized Express Routers (e.g., `router.post(ApiRoutes.Transfers.v1.Initiate, ...)`).
- **The Next.js Frontend App** imports `ApiRoutes` to accurately stitch together its cross-network fetch payloads without manual string hardcoding.

---

## 📁 Hierarchy Map

```text
src/
├── index.ts           # Master export barrel mapping pipeline
├── routes.ts          # Centralized ApiRoutes tree (7 major domains)
└── env/
    ├── base.ts        # Common schemas (NODE_ENV, PORT, LOG_LEVEL)
    └── loader.ts      # Fail-fast validation core engine logic

```

---

## 💻 Concrete Usage Guide

### 1. Bootstrapping Environment Variables inside a Microservice

When writing a new service (e.g., `services/transfer-service/src/config/index.ts`), extend the core schema configurations safely without duplicating basic requirements like `PORT` or `LOG_LEVEL`:

```typescript
import { loadEnvironment } from '@fintech/shared-config';
import { z } from 'zod';

// Define the schema requirements unique ONLY to the Transfer Service
const transferServiceSchema = {
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TRANSFER_LIMIT_MAX_PAISE: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('50000000'), // ₹5,00,000
};

// Validates process.env immediately. Breaks and crashes process if validation rules fail.
export const config = loadEnvironment(transferServiceSchema);

// Exporting types natively derived from the runtime parser configuration
export type ServiceConfig = typeof config;
```

### 2. Mounting Express Routes via Centralized Registry

Use the route map contracts inside your service routing declarations (`src/routes/transfer.routes.ts`) to avoid routing path drift:

```typescript
import { Router } from 'express';
import { ApiRoutes } from '@fintech/shared-config';
import { initiateTransferController } from '../controllers/transfer.controller';

const router = Router();

// Express path resolution hooks clean directly into the shared configuration
router.post(ApiRoutes.Transfers.v1.Initiate, initiateTransferController);

export const transferRouter = router;
```

### 3. Executing Safe Client Fetch Operations (Next.js Application)

Utilize the centralized contract system on your client components to make type-safe endpoint interactions:

```typescript
import { ApiRoutes } from '@fintech/shared-config';

export async function submitUserTransfer(
  fromAccountId: string,
  toAccountId: string,
  amountPaise: number,
  currency: 'INR' | 'USD' | 'EUR',
) {
  // Construct destination dynamically without manually managing raw strings
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
  const finalEndpoint = `${gatewayUrl}${ApiRoutes.Prefixes.Transfers}${ApiRoutes.Transfers.v1.Initiate}`;

  const response = await fetch(finalEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromAccountId, toAccountId, amountPaise, currency }),
  });

  return response.json();
}
```

---

## 🔍 Troubleshooting & Verification

### Modifying and Versioning Paths

When introducing a new API path sequence (e.g., introducing a `v2` endpoint sequence for account parameters):

1. Navigate to `packages/shared-config/src/routes.ts`.
2. Update the immutable `ApiRoutes` object blueprint directly:

```typescript
export const ApiRoutes = {
  // ... current configurations
  Accounts: {
    v1: {
      Create: '/v1/create',
      GetDetails: '/v1/:accountId',
      Freeze: '/v1/:accountId/freeze',
    },
    v2: {
      GetEnhancedProfile: '/v2/profiles/:accountId',
    },
  },
} as const;
```

3. Regenerate declarations across your repository graph from the project root directory:

```bash
# Clean historical builds and run compilation script
npm run build --workspace=@fintech/shared-config

# Validate declaration output profiles
npm run typecheck --workspace=@fintech/shared-config

```

---

### 🏁 Shared Config Package Rebuild Complete

Let's execute a final compilation test to verify that your type maps and documentation match up perfectly:

```bash
npm run build --workspace=@fintech/shared-config

```
