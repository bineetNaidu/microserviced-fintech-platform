# @fintech/shared-types

The foundational data-type registry and network contract layer for the distributed fintech platform. This package serves as the machine-verifiable source of truth for all public-facing HTTP DTO payloads, internal database models, and transactional message schemas across the repository workspaces.

---

## 🛠️ Architectural Rationale & Design Patterns

### 1. Database Entities vs. Public Data Transfer Objects (DTOs)

In a secure production financial architecture, internal database schemas must remain strictly decoupled from the public HTTP network layer.

- **The Gaps with Raw Entities:** Internal database entities (like `Transfer`) contain system-generated metadata tracks—including database autosequenced fields, internal lifecycle state machines, and private failure traces.
- **The Solution:** We implement strict DTO boundaries (`InitiateTransferRequestDto`). This guarantees that incoming client bodies can only submit exactly what is needed for verification (e.g., source, destination, asset value volume) while blocking clients from attempting to alter server-controlled states or override system metadata records.

### 2. Double-Entry Invariant and Primitive Safety (`Paise`, `ULID`, `UUID`)

To prevent accounting anomalies and floating-point rounding errors common with decimal types, all currency assets are tracked via 64-bit signed integers in their lowest denomination:

- **`Paise` (INR):** Stored as absolute integers (e.g., ₹10.50 is handled uniformly as `1050`).
- **`ULID`:** Used for high-volume ledger transactions, providing lexicographically sortable identifiers to optimize indexing performance.
- **`UUID`:** Dedicated strictly to immutable security contexts, such as cross-service user and administrator accounts.

### 3. Distributed Concurrency & Governance Controls

We explicitly bake support for complex runtime patterns directly into our type layer:

- **Maker-Checker Dual Control:** Modeled through `ApprovalRequest` and `ApprovalReview` types to enforce administrative segregation of duties.
- **Optimistic Locking:** Supported via strict version counter properties inside `ScheduledJob` types to guarantee exactly-once execution across active-active cluster replicas.

---

## 📁 Package Structure Layout

```text
src/
├── index.ts           # Master export barrel mapping pipeline
├── errors.ts          # Const-asserted immutable error types and OpenTelemetry traces
├── api.ts             # Generic JSON envelopes and strict discriminated union wrappers
└── domain/            # Core system entities (Postgres row mappings)
│   ├── types.ts       # Primitive definitions (ULID, Paise, Currency tokens, Approval types)
│   ├── account.ts     # Financial account base structures
│   ├── ledger.ts      # Multi-entry ledger transaction frames (append-only)
│   ├── user.ts        # User metadata tracking records and KYC states
│   ├── approval.ts    # Maker-checker dual control verification frames
│   ├── scheduler.ts   # Optimistic concurrency records for distributed cron tasks
│   └── transfer.ts    # Saga state processing records
└── dto/               # Network Transport Layers (API Input/Output Maps)
    ├── account.dto.ts # Account mutation and contract fields
    ├── transfer.dto.ts# Transfer execution and status payloads
    ├── approval.dto.ts# Administrative review payloads and overrides
    ├── audit.dto.ts   # Immutable forensic logging payloads
    └── operations.dto.ts# Platform configuration parameters and blocklists

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

### 2. Consuming Discriminated Unions on Client Applications

Frontend systems can safely narrow response contracts based on the immutable `success` flag to ensure safe parameter evaluation without ambiguous optional checks:

```typescript
import type { ApiResponse, AccountResponseDto } from '@fintech/shared-types';

function handleApiResponse(response: ApiResponse<AccountResponseDto>) {
  if (response.success) {
    // TypeScript automatically narrows this block to ApiSuccessResponse<AccountResponseDto>
    console.log('Account status verified:', response.data.status);
  } else {
    // TypeScript automatically narrows this block to ApiErrorResponse
    console.error(`[${response.error.code}] Mutation rejected: ${response.error.message}`);
    console.error(`Trace ID for core engineering review: ${response.error.traceId}`);
  }
}
```

---

## 🔍 Verification and Build Sequences

Whenever you introduce a modification to an API contract parameter or domain profile schema:

1. Complete the modifications inside the corresponding `src/domain/` or `src/dto/` workspace file.
2. Regenerate definitions and target declarations across the workspace hierarchy:

```bash
# Clean historical declaration builds and execute compiler generation
npm run build --workspace=@fintech/shared-types

# Dry-run signature structural verification check
npm run typecheck --workspace=@fintech/shared-types

```
