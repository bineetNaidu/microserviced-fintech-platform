# 📊 Production Architectural Manual: Ledger Service (`services/ledger-service/`)

The Ledger Service is the absolute financial **Source of Truth** and transaction engine of the platform. Operating under standard double-entry principles, it guarantees that for every transaction, the total sum of debits perfectly equals the total sum of credits (`Total Debits = Total Credits`).

Following strict financial compliance and immutability architectural laws, **this database layer is strictly append-only**. Existing entries are completely locked: rows can never be updated, modified, or deleted at the engine layer.

---

## 1. Database Domain Schema (`ledger_db`)

The Ledger Service runs an isolated PostgreSQL instance. To prevent any downstream rounding vulnerabilities common with floating-point math, all financial values are strictly processed as 64-bit signed integers representing the lowest currency unit (**paise** for INR). Primary keys use time-sortable alphanumeric ULIDs to allow constant $O(1)$ cursor-based pagination.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS ledger_transactions (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID representation
    reference_id VARCHAR(26) NOT NULL UNIQUE, -- Coordinated ULID linking back to the Transfer Saga
    purpose VARCHAR(50) NOT NULL
        CHECK (purpose IN ('USER_TRANSFER', 'DEPOSIT', 'FEE', 'REVERSAL')),
    currency CHAR(3) NOT NULL
        CHECK (currency IN ('INR', 'USD', 'EUR')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    transaction_id VARCHAR(26) NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    account_id VARCHAR(26) NOT NULL, -- Logical reference string bound cross-service
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), -- Absolute values only
    direction VARCHAR(10) NOT NULL
        CHECK (direction IN ('CREDIT', 'DEBIT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS balance_snapshots (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    account_id VARCHAR(26) NOT NULL,
    snapshot_date DATE NOT NULL,
    balance_paise BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    last_processed_entry_id VARCHAR(26) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_account_date_snapshot UNIQUE (account_id, snapshot_date)
);

```

### Immutability Enforcement (Postgres Engine Level)

To achieve production-grade financial integrity, we block write-mutations on the entries tables by revoking operational access privileges from the application runtime user:

```sql
REVOKE UPDATE, DELETE ON TABLE ledger_transactions FROM application_runtime_user;
REVOKE UPDATE, DELETE ON TABLE ledger_entries FROM application_runtime_user;

```

### Indexing Strategy

- `CREATE INDEX idx_entries_account_lookup ON ledger_entries(account_id, created_at DESC);` — Essential optimization layout for computing active ledger streams.
- `CREATE UNIQUE INDEX idx_entries_tx_direction ON ledger_entries(transaction_id, account_id, direction);` — Prevents double-accounting collisions within a single financial transaction context.

---

## 2. API Path Matrix & Payload Contracts

### Endpoint Definitions

#### `POST /v1/internal/ledger/entry`

- **Security Interceptors:** Cluster Private. Public gateway routing paths are hard-blocked at the infrastructure layer. Mandates internal service middleware token authentication (`X-Internal-API-Key`).
- **Request Body (`CreateLedgerTransactionDto`):** Enforces a strict balanced array payload layout:

```json
{
  "referenceId": "01H7X1N8X5R3P7Q8W9Z2K4V5B1",
  "purpose": "USER_TRANSFER",
  "currency": "INR",
  "entries": [
    {
      "accountId": "01H7X1N8X5R3P7Q8W9Z2K4V5A1",
      "amountPaise": 50000,
      "direction": "DEBIT"
    },
    {
      "accountId": "01H7X2M9Y6S4R8P9X0W3L5V6C2",
      "amountPaise": 50000,
      "direction": "CREDIT"
    }
  ]
}
```

- **Response Payload (`201 Created`):**

```json
{
  "success": true,
  "data": {
    "transactionId": "01H7X3P0A1B2C3D4E5F6G7H8I9",
    "status": "RECORDED"
  },
  "meta": null,
  "error": null
}
```

#### `GET /v1/balance/:accountId`

- **Security Interceptors:** Requires active access token verification. Enforces a strict context-matching rule: customers can only query accounts they own, verified by extracting `X-User-ID` configurations from the gateway proxy.
- **Calculation Engine:** Resolves **ADR-017**. Instead of computing thousands of chronological history rows on every load, the service calculates balance via: **`Latest Snapshot Balance + Sum of Entries created after snapshot timestamp`**.

---

## 3. Event-Driven Contract Topology

The Ledger Service coordinates closely with the Saga Orchestrator to ensure atomic state updates across distributed clusters.

```text
                     ┌─────────────────────────┐
                     │    Transfer Service     │
                     └────────────┬────────────┘
                                  │
                                  │ Direct Internal API Call: Post Transaction
                                  ▼
                     ┌─────────────────────────┐
                     │     Ledger Service      │
                     └────────────┬────────────┘
                                  │
                 Publishes Events │
                 (Topic Exchange) ▼
                ┌──────────────────────────────────────┐
                │ exchange: fintech.ledger             │
                └───────────────────┬──────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          │ routingKey:                                       │ routingKey:
          │ ledger.transaction_posted                         │ ledger.balance_breached
          ▼                                                   ▼
┌──────────────────────┐                            ┌──────────────────────┐
│ Queue:               │                            │ Queue:               │
│ transfer-service.sync│                            │ notification-service │
└──────────────────────┘                            └──────────────────────┘

```

### Events Published

- **`ledger.transaction_posted`**
- _Routing Key:_ `ledger.transaction_posted`
- _Payload:_

```json
{
  "eventId": "evt_01H7X3P0Z9R3P7Q8W9Z2K4V5B1",
  "eventType": "ledger.transaction_posted",
  "producerService": "ledger-service",
  "correlationId": "corr_f8b2c4d6...",
  "payload": {
    "transactionId": "01H7X3P0A1B2C3D4E5F6G7H8I9",
    "referenceId": "01H7X1N8X5R3P7Q8W9Z2K4V5B1",
    "currency": "INR",
    "affectedAccounts": ["01H7X1N8X5R3P7Q8W9Z2K4V5A1", "01H7X2M9Y6S4R8P9X0W3L5V6C2"]
  },
  "occurredAt": "2026-06-27T20:26:00.000Z"
}
```

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Mathematical Equation Invariant Guard:** Test the validation code handling incoming transactional rows. Assert that passing an array where the sum of `DEBIT` items does not perfectly equal the sum of `CREDIT` items instantly blocks execution and throws a `BadRequestError` before running SQL connection strings.

### Integration Testing Targets (Docker-Isolated Environment)

- **Database Immutability Execution Defense:** Structure an explicit integration workflow that attempts to trigger an `UPDATE` or `DELETE` SQL script directly on the `ledger_entries` table. Assert that the PostgreSQL database engine forcefully drops the connection path and responds with a `42501 Insufficient Privilege` error exception code.
- **Balance Snapshot Synthesis Validation:** Seed an account row with an initial snapshot of ₹1,000. Insert 5 new debit entry records totaling ₹300. Execute the derived balance endpoint. Assert that the math accurately resolves to exactly ₹700 without loading historical rows prior to the snapshot window.

### Chaos Testing Matrix

- **Concurrent Double-Spend Protection Test:** Simulate a high-velocity race condition where 10 concurrent requests try to submit identical debit transactions against a zero-balance account wrapper at the exact same millisecond. Assert that the underlying Postgres lock mechanics safely process the first transaction, and throw clean database-level isolation exceptions to block the remaining 9 attempts from driving the net account worth below zero.
