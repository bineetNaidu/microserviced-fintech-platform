# @fintech/shared-types

The foundational data-type registry and contract layer for the distributed fintech platform. This package serves as the single source of truth for all network interfaces, core database models, and API payload contracts across the repository workspaces.

---

## 🛠️ Architectural Rationale & Design Patterns

### 1. Machine-Verifiable API Contracts

In a microservices mesh, service-to-service string mismatches (e.g., Service A publishing an event payload with the field name `from_account_id` while Service B expects `fromAccountId`) lead to silent execution drops and data corruption. This package eliminates schema drift by providing typed compile-time constraints. If an endpoint payload or message envelope is modified, TypeScript catches the type incompatibility at compile time before any binaries are built.

### 2. Standardized JSON Envelope (`ApiResponse<T>`)

Every downstream endpoint on the platform uses an identical structural wrapper:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "nextCursor": "...", "hasMore": false },
  "error": null
}

```

By utilizing generic TypeScript types (`ApiResponse<T>`), we force all microservices to wrap their domain data inside this contract. The package also implements **Discriminated Unions** (`ApiSuccessResponse<T>` and `ApiErrorResponse`) to enable type narrowing when handling responses on the Next.js frontend or across service boundaries.

### 3. Dynamic Balance Derivation (No Balance Property)

Following strict double-entry principles, the `Account` interface deliberately excludes a mutable `balance` property. An account's net worth is an active derived value computed exclusively by the `ledger-service` by querying and summing chronological records.

---

## 📁 Package Blueprint

```text
src/
├── index.ts           # Master barrel export pipeline
├── errors.ts          # Const-asserted immutable error types
├── api.ts             # Generic API envelopes and pagination meta
└── domain/            # Core system entity blueprints (ULID targeted)
    ├── account.ts     # Financial account descriptors
    ├── ledger.ts      # Double-entry transaction and entry formats
    └── transfer.ts    # Saga state machine fields

```

---

## 💻 Concrete Usage Guide

### 1. Enforcing Type-Safe API Controller Outputs (Backend Layer)

Use the explicit response types inside your Express routing controllers to guarantee your output conforms to the global JSON envelope pattern:

```typescript
import { Request, Response } from 'express';
import type { ApiSuccessResponse, Account } from '@fintech/shared-types';

export async function createAccountController(
  req: Request,
  res: Response,
): Promise<Response<ApiSuccessResponse<Account>>> {
  const newAccount: Account = await accountEngine.provision({
    userId: req.body.userId,
    type: 'CHECKING',
  });

  // Structure perfectly maps to ApiSuccessResponse layout
  return res.status(201).json({
    success: true,
    data: newAccount,
    meta: null,
    error: null,
  });
}
```

### 2. Structural Error Code Validation (Guard Layer)

The error tracking dictionary relies on a `const` assertion rather than traditional TypeScript enums. This lets us use the error codes directly as runtime string values while keeping them strictly typed at compile time:

```typescript
import { ErrorCode, type ErrorCodeType } from '@fintech/shared-types';

function handlePlatformException(code: ErrorCodeType) {
  // TypeScript will break compilation if 'code' does not belong
  // to our immutable ErrorCode registry
  if (code === ErrorCode.INSUFFICIENT_FUNDS) {
    console.warn('Debit transaction rejected due to lack of available funds.');
  }
}
```

### 3. Resolving Type Narrowing on the Client (Next.js Layer)

When consuming endpoint payloads inside your frontend fetch layout, use the `success` flag to cleanly narrow down types and unlock intellisense:

```typescript
import type { ApiResponse, Transfer } from '@fintech/shared-types';

async function fetchTransferStatus(id: string) {
  const res = await fetch(`/api/v1/transfers/status/${id}`);
  const payload: ApiResponse<Transfer> = await res.json();

  if (payload.success) {
    // Discriminated union narrows payload to ApiSuccessResponse.
    // 'data' is guaranteed to be present and typed as Transfer.
    console.log(`Transfer status: ${payload.data.status}`);
  } else {
    // Payload narrows to ApiErrorResponse.
    // 'data' is guaranteed to be null, and 'error' contains strict details.
    console.error(`Execution failed with code: ${payload.error.code}`);
  }
}
```

---

## 🔍 Troubleshooting & Verification

### Modifying Domain Models

When updating core entity configurations (e.g., adding an audit metadata structure or extending account parameters):

1. Modify the target file inside the `src/domain/` directory.
2. If introducing new system-wide constants, append them to `src/errors.ts`.
3. Run compilation to regenerate definitions across the workspace:

```bash
npm run build --workspace=@fintech/shared-types

```

4. Run code validation to ensure no downstream workspaces are broken by the change:

```bash
npm run typecheck

```
