# @fintech/shared-types

The foundational data-type registry and network contract layer for the distributed fintech platform. This package serves as the machine-verifiable source of truth for all public-facing HTTP DTO payloads, internal database models, and transactional message schemas across the repository workspaces.

---

## 🛠️ Architectural Rationale & Design Patterns

### 1. Database Entities vs. Public Data Transfer Objects (DTOs)

In a secure production financial architecture, internal database schemas must remain strictly decoupled from the public HTTP network layer.

- **The Gaps with Raw Entities:** Internal database entities (like `Transfer`) contain system-generated metadata tracks—including database autosequenced `id` parameters, localized `createdAt` timestamps, lifecycle state machines, and private failure traces.
- **The Solution:** We implement strict DTO boundaries (`InitiateTransferRequestDto`). This guarantees that incoming client bodies can only submit exactly what is needed for verification (e.g., source, destination, asset value volume) while blocking clients from attempting to alter server-controlled states or override system metadata records.

### 2. Embedded Currency Tracking (`CurrencyType`)

To ensure future-proof multi-currency operation without complex database migrations, currency definitions are explicitly baked directly into our ledger and routing payload states from day one. Both ledger balance aggregators and saga orchestrators evaluate the `currency` parameter to guarantee that debits, credits, and validation thresholds maintain asset alignment without risk of accidental conversion bugs.

---

## 📁 Package Structure Layout

```text
src/
├── index.ts           # Master export barrel mapping pipeline
├── errors.ts          # Const-asserted immutable error types
├── api.ts             # Generic JSON envelopes and pagination metadata
└── domain/            # Core system entities (Postgres row mappings)
│   ├── types.ts       # Primitive definitions (ULID, Paise, Currency tokens)
│   ├── account.ts     # Financial account base structures
│   ├── ledger.ts      # Multi-entry ledger transaction frames
│   └── transfer.ts    # Saga state processing records
└── dto/               # Network Transport Layers (API Input/Output Maps)
    ├── account.dto.ts # Account mutation and contract fields
    └── transfer.dto.ts# Transfer execution and status payloads

```

---

## 💻 Concrete DTO and Contract Usage Guide

### 1. Consuming Type-Safe Inputs inside an Express Router Controller

When building a transaction routing handler (e.g., `services/transfer-service/src/controllers/transfer.controller.ts`), enforce your incoming body boundaries using the DTO maps directly:

```typescript
import { Request, Response } from 'express';
import type {
  InitiateTransferRequestDto,
  ApiSuccessResponse,
  Transfer,
} from '@fintech/shared-types';

export async function startTransferController(
  req: Request,
  res: Response,
): Promise<Response<ApiSuccessResponse<Transfer>>> {
  // Cast incoming parameters directly to the strict input boundary contract
  const payload = req.body as InitiateTransferRequestDto;

  // The type contract guarantees compilation-level safety for these parameters:
  const sagaRecord = await transferSagaEngine.orchestrate(
    payload.fromAccountId,
    payload.toAccountId,
    payload.amountPaise,
    payload.currency,
  );

  return res.status(202).json({
    success: true,
    data: sagaRecord,
    meta: null,
    error: null,
  });
}
```

---

## 🔍 Verification and Build Sequences

Whenever you introduce a modification to an API contract parameter or domain profile schema:

1. Complete the modifications inside the corresponding `src/domain/` or `src/dto/` workspace file.
2. Regenerate definitions and target declarations across the workspace hierarchy:

```bash
npm run build --workspace=@fintech/shared-types

```
