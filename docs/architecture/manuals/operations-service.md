# ⚙️ Production Architectural Manual: Operations Service (`services/operations-service/`)

The Operations Service is the core administrative back-office motor of the system. It handles system configuration tracking, fee profile definitions, manual account freezes, blocklists, and platform-wide emergency configurations.

While everyday transfers are automated, **this service manages internal settings layers**. It enables authorized managers or system applications to issue overrides that dynamically fine-tune the behavior of downstream routing paths.

---

## 1. Database Domain Schema (`operations_db`)

The Operations Service manages an isolated PostgreSQL instance to preserve platform configurations.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS platform_configs (
    key VARCHAR(100) PRIMARY KEY, -- e.g., 'GLOBAL_TRANSFER_HALT', 'MAINTENANCE_MODE'
    value VARCHAR(255) NOT NULL,
    updated_by UUID NOT NULL, -- Admin User ID reference
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_blocklists (
    id VARCHAR(26) PRIMARY KEY, -- Strict ULID representation
    type VARCHAR(30) NOT NULL CHECK (type IN ('IP_ADDRESS', 'EMAIL_DOMAIN', 'PAN_CARD', 'BANK_ACCOUNT')),
    value VARCHAR(255) NOT NULL UNIQUE, -- e.g., 'bad-actor@domain.com'
    reason TEXT NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_profiles (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    tier_name VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'STANDARD_RETAIL', 'HIGH_VOLUME_MERCHANT'
    fixed_fee_paise BIGINT NOT NULL DEFAULT 0,
    percentage_fee_bps INT NOT NULL DEFAULT 0, -- Stored in Basis Points (1 bps = 0.01%)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Indexing Strategy

- `CREATE INDEX idx_blocklist_lookup ON system_blocklists(type, value);` — Crucial fast path optimization utilized during authentication or onboarding verification checks.

---

## 2. API Path Matrix & Payload Contracts

### Endpoint Definitions

#### `POST /v1/operations/configs`

- **Security Interceptors:** Back-Office Restricted. Requires active administrative access token matching checks with roles bounded to `manager` or `admin`.
- **Request Body (`UpdateConfigDto`):**

```json
{
  "key": "GLOBAL_TRANSFER_HALT",
  "value": "true"
}
```

- **Response Payload (`200 OK`):**

```json
{
  "success": true,
  "data": { "key": "GLOBAL_TRANSFER_HALT", "value": "true" },
  "meta": null,
  "error": null
}
```

---

## 3. Event-Driven Contract Topology

The Operations Service broadcasts system state adjustments over the `fintech.operations` exchange, allowing other microservices to reactively adapt their local caches.

```text
                     ┌─────────────────────────┐
                     │   Operations Service    │
                     └────────────┬────────────┘
                                  │
                 Publishes Events │
                 (Topic Exchange) ▼
                ┌──────────────────────────────────────┐
                │ exchange: fintech.operations         │
                └───────────────────┬──────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          │ routingKey:                                       │ routingKey:
          │ operations.config_changed                         │ operations.blocklist_added
          ▼                                                   ▼
┌──────────────────────┐                            ┌──────────────────────┐
│ Queue:               │                            │ Queue:               │
│ transfer-service.halt│                            │ auth-service.block   │
└──────────────────────┘                            └──────────────────────┘

```

### Events Published

- **`operations.config_changed`**
- _Routing Key:_ `operations.config_changed`
- _Payload:_

```json
{
  "eventId": "evt_01H7XBM4A3B2C1D0E9F8G7H6L1",
  "eventType": "operations.config_changed",
  "producerService": "operations-service",
  "correlationId": "corr_ops_1b2c3d...",
  "payload": {
    "key": "GLOBAL_TRANSFER_HALT",
    "oldValue": "false",
    "newValue": "true"
  },
  "occurredAt": "2026-06-27T21:20:00.000Z"
}
```

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Basis Points Validation Guard:** Test the `fee_profiles` parameter layer. Verify that submitting a `percentage_fee_bps` exceeding 10000 (100%) throws a validation error before hitting persistent databases.

### Integration Testing Targets (Docker-Isolated Environment)

- **Dynamic Interception Overrides:** Insert an item containing `GLOBAL_TRANSFER_HALT = true` inside the configurations container. Mock an administrative worker calling downstream validation paths. Assert that target engines successfully flag configuration updates.

### Chaos Testing Matrix

- **Config Cache Drift Replay Loop:** Break connectivity channels with RabbitMQ during an operational setting rewrite pass. Assert that settings fall back securely to transactional DB states without locking up downline containers during recovery intervals.
