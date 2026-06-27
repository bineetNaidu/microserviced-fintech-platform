# 🏦 Production Architectural Manual: Account Service (`services/account-service/`)

The Account Service is the operational **Rule Maker** and ledger gatekeeper of the platform. It defines the financial boundary properties of users, enforces transactional velocity limits, and tracks account state invariants.

Following strict clean-architecture and double-entry paradigms, **this service explicitly stores no monetary balances or mutable currency figures**. It maps structural configurations, routing metadata, and legal status layers to accounts.

---

## 1. Database Domain Schema (`account_db`)

The Account Service relies on an isolated PostgreSQL instance. It uses ULIDs for Account IDs to support high-performance cursor pagination and deterministic time-sorting across service boundaries.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(26) PRIMARY KEY, -- Strict ULID representation (26-character alphanumeric string)
    user_id UUID NOT NULL, -- Coordinated UUID cross-reference to user-service
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('CHECKING', 'SAVINGS', 'SUSPENSE')),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
    currency CHAR(3) NOT NULL DEFAULT 'INR', -- ISO 4217 Currency Parameter
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS account_limits (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    account_id VARCHAR(26) NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    daily_velocity_limit_paise BIGINT NOT NULL DEFAULT 50000000, -- Default max: ₹5,00,000.00
    single_transaction_limit_paise BIGINT NOT NULL DEFAULT 10000000, -- Default max: ₹1,00,000.00
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Indexing & Constraints Strategy

- `CREATE UNIQUE INDEX idx_accounts_ulid ON accounts(id);` — Core lookup engine index.
- `CREATE INDEX idx_accounts_user_currency ON accounts(user_id, currency) WHERE deleted_at IS NULL;` — Optimizes portfolio checks when checking available currencies per user.
- `CREATE INDEX idx_accounts_status_verification ON accounts(id, status);` — Vital optimization path for fast multi-service authorization/compliance checks.

---

## 2. API Path Matrix & Payload Contracts

### Security Interceptor & Verification Invariant

Downstream mutations (`/v1/create`) cannot accept an arbitrary `userId` inside the JSON body. The endpoint extracts the payload parameters, but verifies ownership via the Gateway-injected header `X-User-ID`, matching it against the authenticated session context.

#### Endpoint Definitions

##### `POST /v1/create`

- **Security Interceptors:** Private. Requires active access token verification.
- **Request Body (`CreateAccountRequestDto`):**

```json
{
  "type": "CHECKING",
  "currency": "INR"
}
```

- **Response Payload (`201 Created`):**

```json
{
  "success": true,
  "data": {
    "id": "01H7X1N8X5R3P7Q8W9Z2K4V5B1",
    "userId": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
    "type": "CHECKING",
    "status": "ACTIVE",
    "currency": "INR",
    "createdAt": "2026-06-27T20:15:00.000Z"
  },
  "meta": null,
  "error": null
}
```

##### `GET /v1/:accountId`

- **Security Interceptors:** Token Verified. Enforces a strict context-matching rule: a customer can only retrieve accounts where `user_id == X-User-ID`, whereas an internal service with a valid `X-Internal-API-Key` bypassed the boundary check.
- **Response Payload (`200 OK`):** Returns full `AccountResponseDto` mapping details.

##### `POST /v1/internal/validate-bounds`

- **Security Interceptors:** Cluster Private. Blocks external public hits. Mandates internal key exchange header authorization.
- **Purpose:** Allows the `transfer-service` Saga orchestrator to synchronously validate that both sender and receiver accounts exist, operate in matching currencies, and are in `ACTIVE` compliance states before initializing transfers.
- **Request Body:** `{ "fromAccountId": "01H7X1...", "toAccountId": "01H7X2...", "amountPaise": 50000 }`
- **Response Payload (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "isValid": true,
    "currency": "INR"
  },
  "meta": null,
  "error": null
}
```

---

## 3. Event-Driven Contract Topology

The Account Service listens to asynchronous user status adjustments to reactively manipulate its local status pools.

```text
                       ┌─────────────────────────┐
                       │      User Service       │
                       └────────────┬────────────┘
                                    │
                                    │ Publishes event: user.kyc_status_changed
                                    ▼
                      ┌───────────────────────────┐
                      │ exchange: fintech.users   │
                      └─────────────┬─────────────┘
                                    │
                                    │ routingKey: user.kyc_status_changed
                                    ▼
                      ┌───────────────────────────┐
                      │ Queue:                    │
                      │ account-service.kyc_sync  │
                      └─────────────┬─────────────┘
                                    │
                                    │ Evaluates compliance change
                                    ▼
                       ┌─────────────────────────┐
                       │     Account Service     │
                       └────────────┬────────────┘
                                    │
                   Publishes Events │
                   (Topic Exchange) ▼
                  ┌──────────────────────────────────────┐
                  │ exchange: fintech.accounts           │
                  └───────────────────┬──────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │ routingKey:                                       │ routingKey:
            │ account.created                                   │ account.frozen
            ▼                                                   ▼
 ┌──────────────────────┐                            ┌──────────────────────┐
 │ Queue:               │                            │ Queue:               │
 │ ledger-service.sync  │                            │ transfer-service.halt│
 └──────────────────────┘                            └──────────────────────┘

```

### Events Published

- **`account.created`**
- _Routing Key:_ `account.created`
- _Payload:_

```json
{
  "eventId": "evt_01H7X1N9Z9R3P7Q8W9Z2K4V5B1",
  "eventType": "account.created",
  "producerService": "account-service",
  "correlationId": "corr_e4a1b2c3...",
  "payload": {
    "accountId": "01H7X1N8X5R3P7Q8W9Z2K4V5B1",
    "userId": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
    "type": "CHECKING",
    "currency": "INR",
    "status": "ACTIVE"
  },
  "occurredAt": "2026-06-27T20:15:01.000Z"
}
```

### Events Consumed

- **`user.kyc_status_changed` (From `user-service`)**: If a user's KYC status transitions to `suspended` or `rejected`, the consumer triggers a local query transaction to freeze all corresponding financial records, changing `status = 'FROZEN'`.

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Single-Transaction Limit Breach Guard:** Mock input values and verify that passing an execution volume exceeding the `single_transaction_limit_paise` configuration parameters triggers a clean `BadRequestError` containing a structural `TRANSFER_LIMIT_EXCEEDED` error code.

### Integration Testing Targets (Docker-Isolated Environment)

- **Cross-Tenant Validation Exploit Defense:** Stub an execution context where a client session authenticated as User `A` attempts to read account transaction structures belonging to User `B` via `GET /v1/01H7X1...`. Assert that the interceptor layer blocks execution and outputs a `403 Forbidden` response.
- **Asynchronous Freeze Chain Automation:** Inject a mocked `user.kyc_status_changed` payload with `newStatus: 'suspended'` into the test RabbitMQ exchange container. Wait for consumer loop execution. Query the isolated database instance. Assert that every account row assigned to that user profile was automatically shifted to `FROZEN`.

### Chaos Testing Matrix

- **Database Deadlock Resolution:** Execute a massive, concurrent batch of limit updates and verification status reads against a single account row within multiple asynchronous worker threads. Verify that the application engine gracefully intercepts Postgres serialization locks and accurately drops back through retries without leaking unverified parameters to the ledger orchestrators.
