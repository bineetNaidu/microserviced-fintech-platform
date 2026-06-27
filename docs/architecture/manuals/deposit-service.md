# 📥 Production Architectural Manual: Deposit Service (`services/deposit-service/`)

The Deposit Service manages **Fiat On-Ramping and External Payment Gateway Ingestion** (e.g., UPI webhook parsing, card rails integration, virtual account polling). It bridges the external financial banking infrastructure with the internal core ledger.

To maintain isolation, **this service acts purely as a transactional intake funnel**. It validates external provider payloads, issues internal commands to credit client checking accounts, and tracks external correlation IDs to guarantee that no external payment hook is ever processed twice.

---

## 1. Database Domain Schema (`deposit_db`)

The Deposit Service manages an isolated PostgreSQL instance. It maps unique bank transaction IDs to internal accounts using time-sortable alphanumeric ULIDs.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS external_deposits (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID representation
    account_id VARCHAR(26) NOT NULL, -- Logical reference string bound cross-service
    provider_name VARCHAR(50) NOT NULL, -- e.g., 'RAZORPAY', 'STRIPE', 'ICICI_BANK'
    provider_transaction_id VARCHAR(255) NOT NULL, -- Unique ID coming from the bank rails
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), -- 64-bit integer
    currency CHAR(3) NOT NULL CHECK (currency IN ('INR', 'USD', 'EUR')),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    raw_webhook_payload JSONB DEFAULT NULL, -- Full request payload saved for audit/forensics
    error_code VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_provider_tx UNIQUE (provider_name, provider_transaction_id)
);

```

### Indexing Strategy

- `CREATE UNIQUE INDEX idx_deposit_idempotency ON external_deposits(provider_name, provider_transaction_id);` — Crucial hardware-level defense against delayed webhooks or bank network retry loops firing twice.
- `CREATE INDEX idx_deposit_account ON external_deposits(account_id, status);` — Speeds up customer profile on-ramp history sweeps.

---

## 2. API Path Matrix & Payload Contracts

### Endpoint Definitions

#### `POST /v1/webhooks/deposits/:provider`

- **Security Interceptors:** Public Facing (At Gateway Edge). Requires signature verification custom middleware (`X-Provider-Signature`) matching asymmetric bank certificates to prove the payload hasn't been intercepted or faked.
- **Request Body (`Raw Webhook Payload`):** Directly maps the raw provider data layout (saved to `raw_webhook_payload`).
- **Processing Execution:** The controller extracts provider-specific values, normalizes them into internal fields, and instantly returns a `200 OK` to the bank to release the connection thread pool before processing the internal transfer.
- **Response Payload (`200 OK`):**

```json
{
  "status": "ACKNOWLEDGED"
}
```

---

## 3. Event-Driven Contract Topology

The Deposit Service parses incoming webhooks and hands off execution to the core transactional engines via RabbitMQ to avoid stalling synchronous banking connections.

```text
       [ External Bank Webhook / Notification ]
                         │
                         ▼
             ┌───────────────────────┐
             │    Deposit Service    │
             └───────────┬───────────┘
                         │
        Publishes Event: │ (Ensures loose coupling)
        (Topic Exchange) ▼
       ┌──────────────────────────────────────┐
       │ exchange: fintech.deposits           │
       └─────────────────┬────────────────────┘
                         │
                         │ routingKey: deposit.received
                         ▼
        ┌──────────────────────────────────┐
        │ Queue:                           │
        │ transfer-service.deposit_ingest  │ ──► Spawns Auto-Deposit Saga
        └──────────────────────────────────┘

```

### Events Published

- **`deposit.received`**
- _Routing Key:_ `deposit.received`
- _Payload:_

```json
{
  "eventId": "evt_01H7XAM4A3B2C1D0E9F8G7H6L5",
  "eventType": "deposit.received",
  "producerService": "deposit-service",
  "correlationId": "corr_dep_9b8c7d6e...",
  "payload": {
    "depositId": "01H7XAM4A3B2C1D0E9F8G7H6L5",
    "accountId": "01H7X1N8X5R3P7Q8W9Z2K4V5A1",
    "amountPaise": 250000, -- ₹2,500.00
    "currency": "INR",
    "provider": "RAZORPAY"
  },
  "occurredAt": "2026-06-27T21:10:00.000Z"
}

```

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Webhook Signature Verification Logic:** Test the crypto validation module. Assert that an incoming payload whose hash signature fails validation using the provider's asymmetric key configuration drops the route execution path instantly, returning an unhandled security warning.

### Integration Testing Targets (Docker-Isolated Environment)

- **Bank Webhook Replay Protection Invariant:** Concurrently submit two identical network payloads representing the same provider transaction reference string. Assert that the underlying unique constraint catches the second item, drops execution cleanly with no duplicate entries, and returns a fast acknowledgement status code.

### Chaos Testing Matrix

- **Downstream Broker Failure Outage:** Sever the network link to the message broker while an automated payment hook hits the endpoint. Assert that the service handles the disruption by storing the normalized entity state as `PROCESSING` inside the database layer, allowing a persistent localized background worker to retry broadcasting the `deposit.received` payload upon broker recovery.
