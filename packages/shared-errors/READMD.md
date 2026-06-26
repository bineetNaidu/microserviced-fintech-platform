# @fintech/shared-errors

A highly structural, object-oriented error handling package designed specifically for production-grade distributed fintech services. This package eliminates arbitrary runtime exceptions and generic `500 Internal Server Error` responses by enforcing an intentional, strongly typed domain exception hierarchy.

---

## 🛠️ Architectural Rationale & Design Patterns

### 1. Re-establishing Prototype Chains

In TypeScript/JavaScript, when a custom class extends the native `Error` object, executing `super(message)` can drop or mangle the class prototype chain when compiled down to older targets (like `ES5` or `CommonJS`).
To ensure that standard runtime assertions like `if (error instanceof BaseAppError)` function accurately across network boundaries, this package explicitly repairs the prototype link inside the root constructor via:

```typescript
Object.setPrototypeOf(this, new.target.prototype);
```

### 2. V8 Stack Trace Filtering

When an error is thrown, the stack trace natively captures every single call-site, including the internal code execution lines where your custom exception wrapper itself was instantiated. This pollutes telemetry outputs. We use `Error.captureStackTrace(this, this.constructor)` to cleanly trim the error's own constructor out of the log, starting the trace exactly at the application domain layer where the issue actually happened.

### 3. Structural Validation Breakdown (`ApiErrorDetail`)

When requests break parameters (e.g., Zod schema failures), it is not enough to pass a flat error string. Frontends require field-level parsing. Every exception can swallow an array of `ApiErrorDetail` items to pinpoint exactly which input parameter (like `amountPaise`) failed validation constraints.

---

## 📁 Hierarchy Map

```text
BaseAppError (Abstract Master Parent Class)
 ├── BadRequestError ---------> [HTTP 400] Validation and parameters fail
 ├── UnauthorizedError -------> [HTTP 401] Invalid JWTs, sessions, or signatures
 ├── ForbiddenError ----------> [HTTP 403] Valid identity, but frozen or lacks RBAC roles
 ├── NotFoundError -----------> [HTTP 404] Resource entity missing in Postgres database
 └── ConflictError -----------> [HTTP 409] Idempotency key state reuse collisions

```

---

## 💻 Concrete Usage Guide

### 1. Fundamental Validation Level Guard (Controller Layer)

Use `BadRequestError` to explicitly catch data issues before passing control down into business engines:

```typescript
import { BadRequestError } from '@fintech/shared-errors';

export function validateTransferPayload(amountPaise: number) {
  if (amountPaise <= 0) {
    throw new BadRequestError('Invalid monetary execution volume.', [
      {
        field: 'amountPaise',
        message: 'Transaction amounts must be positive integers strictly greater than zero.',
      },
    ]);
  }
}
```

### 2. Core Business Rule Exception Guard (Service Layer)

Use domain exceptions to protect core invariants, like blocking interactions on locked accounts:

```typescript
import { ForbiddenError, NotFoundError } from '@fintech/shared-errors';

export async function processLedgerDebit(accountId: string) {
  const account = await db.accounts.findById(accountId);

  if (!account) {
    throw new NotFoundError(
      `Account identity key '${accountId}' is not registered on the platform.`,
    );
  }

  if (account.status === 'FROZEN') {
    throw new ForbiddenError(
      'Action rejected. This financial account has been frozen due to compliance hold.',
    );
  }
}
```

### 3. The Central Global Express Error Handler Integration

This is how your upcoming middleware will parse these exact classes to render our standard, predictable JSON envelopes out to the frontend:

```typescript
import { Request, Response, NextFunction } from 'express';
import { BaseAppError } from '@fintech/shared-errors';
import { ErrorCode } from '@fintech/shared-types';

export function globalErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Catch our custom structural exceptions
  if (err instanceof BaseAppError) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        traceId: req.headers['x-correlation-id'] || 'system-fallback',
      },
    });
  }

  // Catch completely unhandled/unexpected system errors (e.g. Database connection timeouts)
  return res.status(500).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'A critical unhandled execution exception occurred on the platform infrastructure.',
      details: process.env.NODE_ENV === 'development' ? [{ message: err.message }] : [],
    },
  });
}
```

---

## 🔍 Troubleshooting & Verification

### Why does `instanceof` evaluate to `false` when it shouldn't?

If you catch an error and `error instanceof BadRequestError` yields `false` even though the error looks exactly like a `BadRequestError`, check your **workspace linking**:

1. You may have duplicate copies of the `@fintech/shared-errors` dependency built in different `node_modules` folders across workspaces. Run `npm update` at your monorepo root to force npm workspaces to cleanly deduplicate symlinks.
2. Ensure you have run `npm run build` inside `packages/shared-errors` so that the latest compiled javascript targets match the TypeScript types.

### How to extend and add a completely new error type?

If you need to add a specialized exception (e.g., `InsufficientFundsError`), always inherit from `BaseAppError`:

```typescript
import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

export class InsufficientFundsError extends BaseAppError {
  public readonly statusCode = 422; // Unprocessable Entity

  constructor(
    message = 'Available account clearing balance is insufficient for transaction request.',
  ) {
    super(ErrorCode.INSUFFICIENT_FUNDS, message);
  }
}
```

Remember to add your new class file to `src/domain/` and export it explicitly inside your master barrel `src/index.ts`.
