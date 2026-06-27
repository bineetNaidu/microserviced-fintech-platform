# 🔀 Production Architectural Manual: Transfer Service (`services/transfer-service/`)

The Transfer Service is the operational **Saga Orchestrator** (State Machine) of the platform. It handles the lifecycle of financial transfers spanning multiple microservice boundaries. It ensures distributed transactional integrity by executing explicit forward commands or coordinating automated compensation routines (refunds) when downstream steps fail.

---

## 1. Database Domain Schema (`transfer_db`)

The Transfer Service maintains a dedicated database to track transaction lifecycles, enforce multi-service idempotency constraints, and record state execution history. It uses alphanumeric ULIDs for high-performance sorting and query correlation.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS transfers (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID representation
    idempotency_key VARCHAR(255) NOT NULL UNIQUE, -- Client-generated UUID string
    from_account_id VARCHAR(26) NOT NULL, -- Logical reference string
    to_account_id VARCHAR(26) NOT NULL, -- Logical reference string
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), -- 64-bit integer
    currency CHAR(3) NOT NULL CHECK (currency IN ('INR', 'USD', 'EUR')),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'DEBITING', 'CREDITING', 'COMPLETED', 'FAILED', 'REVERSING', 'REVERSED')),
    failure_reason TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saga_execution_logs (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    transfer_id VARCHAR(26) NOT NULL REFERENCES transfers(id) ON DELETE RESTRICT,
    step_name VARCHAR(50) NOT NULL
        CHECK (step_name IN ('VALIDATE_ACCOUNTS', 'EXECUTE_LEDGER_ENTRIES', 'DISPATCH_NOTIFICATIONS')),
    step_status VARCHAR(20) NOT NULL
        CHECK (step_status IN ('STARTED', 'SUCCESS', 'FAILED', 'COMPENSATED')),
    payload JSONB DEFAULT NULL, -- Debug snapshot of data passed/returned
    execution_time_ms INT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Indexing Strategy

- `CREATE UNIQUE INDEX idx_transfers_idempotency ON transfers(idempotency_key);` — Enforces hardware-level protection against double-submission bursts.
- `CREATE INDEX idx_transfers_status_polling ON transfers(status, created_at DESC) WHERE status IN ('PENDING', 'DEBITING', 'CREDITING', 'REVERSING');` — Optimizes lookups for background retry workers picking up stuck Sagas.

---

## 2. API Path Matrix & Payload Contracts

### Idempotency Verification Invariant

Clients submitting a transfer must include an `Idempotency-Key` header. If a request arrives with an existing key, the API gateway or controller short-circuits the request: if the payload matches exactly, it returns the stored response; if the payload has altered, it immediately rejects the call with a `409 Conflict` error.

### Endpoint Definitions

#### `POST /v1/transfers/initiate`

- **Security Interceptors:** Private. Active access token verification mandatory. Enforces a multi-tenant validation rule: the controller extracts `X-User-ID` from the gateway header and guarantees that `from_account_id` is owned by that specific identity.
- **Request Body (`InitiateTransferRequestDto`):**

```json
{
  "fromAccountId": "01H7X1N8X5R3P7Q8W9Z2K4V5A1",
  "toAccountId": "01H7X2M9Y6S4R8P9X0W3L5V6C2",
  "amountPaise": 50000,
  "currency": "INR"
}
```

- **Response Payload (`202 Accepted`):**

```json
{
  "success": true,
  "data": {
    "id": "01H7X5N4A3B2C1D0E9F8G7H6I5",
    "status": "PENDING",
    "amountPaise": 50000,
    "currency": "INR"
  },
  "meta": null,
  "error": null
}
```

#### `GET /v1/transfers/status/:transferId`

- **Security Interceptors:** Token Verified. Access limited to sender or receiver profiles through token claims validation.

---

## 3. The Orchestration Lifecycle State Machine

The Transfer Service acts as a centralized orchestrator, managing step transitions over internal APIs and broadcasting final outcomes asynchronously over RabbitMQ.

```text
       [ Client Request ]
               │
               ▼
       ( Check Idempotency ) ──( Found )──► Return Cached Result / 409
               │
           ( New Key )
               ▼
     [ Status: PENDING ] ──► Sync Call: Account Service (Verify limits/status)
               │
         ( Validated )
               ▼
     [ Status: DEBITING ] ──► Sync Call: Ledger Service (Post Debit/Credit entries)
               │
        ┌──────┴────────────────────────┐
    ( Success )                     ( Failure )
        ▼                               ▼
 [ Status: COMPLETED ]          [ Status: REVERSING ]
        │                               │
        │                       Execute Ledger Refund Entries
        │                               │
        ▼                               ▼
 Broadcast: transfer.completed   [ Status: REVERSED ]
                                        │
                                        ▼
                                 Broadcast: transfer.failed

```

### Events Published

- **`transfer.completed`**
- _Routing Key:_ `transfer.completed`
- _Payload:_

```json
{
  "eventId": "evt_01H7X5N5Z9R3P7Q8W9Z2K4V5B1",
  "eventType": "transfer.completed",
  "producerService": "transfer-service",
  "correlationId": "corr_a1b2c3d4...",
  "payload": {
    "transferId": "01H7X5N4A3B2C1D0E9F8G7H6I5",
    "fromAccountId": "01H7X1N8X5R3P7Q8W9Z2K4V5A1",
    "toAccountId": "01H7X2M9Y6S4R8P9X0W3L5V6C2",
    "amountPaise": 50000,
    "currency": "INR"
  },
  "occurredAt": "2026-06-27T20:51:00.000Z"
}
```

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Saga State Routing Transitions:** Test the inner finite state machine code block. Assert that moving a transfer directly from `PENDING` to `COMPLETED` without setting the interim `DEBITING` transactional trace logs throws an orchestration execution error.

### Integration Testing Targets (Docker-Isolated Environment)

- **Strict Idempotency Locking Run:** Concurrently invoke `POST /v1/transfers/initiate` three times within a single-millisecond window using the exact same `Idempotency-Key` string and payload. Assert that exactly one database row is successfully recorded, and that duplicate payloads gracefully receive matching, identical transaction identifiers without triggering double database entries.
- **Saga Automated Failure Compensation Workflow:** Stub the `Ledger Service` communication mock to forcefully fail with an `INSUFFICIENT_FUNDS` error response. Run the initiation loop. Assert that the `transfer_db` automatically updates the row status trail to `REVERSING` and resolves perfectly to `FAILED`, with the precise downstream code logged to `failure_reason`.

### Chaos Testing Matrix

- **Orchestrator Mid-Flight Container Crash:** Initiate a transfer execution loop, and inject an artificial crash kill code immediately after the status alters to `DEBITING` but before the ledger call receives confirmation. Upon background container reboot, assert that the automated tracking scheduler picks up the unresolved row from the database scan, reconciles with the Ledger Service state, and cleanly drives the Saga loop to a proper structural conclusion.

---

The orchestration pipeline specification is locked. Give me the commit message confirmation, and tell me which service from your repository directory we should tackle next!
