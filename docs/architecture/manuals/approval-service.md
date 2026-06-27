# 👥 Production Architectural Manual: Approval Service (`services/approval-service/`)

The Approval Service implements the platform's **Dual-Control (Maker-Checker) Security Governance Pattern**. In a production-grade financial system, high-risk administrative mutations—such as lifting daily transaction limits, overriding KYC rejections, manual balance adjustments, or releasing frozen accounts—cannot be executed by a single operator.

The service intercepts these requests, drops them into a pending review state, and mandates explicit cryptographic sign-off from an independent, authorized second administrator before releasing the transaction execution hooks.

---

## 1. Database Domain Schema (`approval_db`)

The Approval Service manages an isolated PostgreSQL instance. It utilizes time-sortable alphanumeric ULIDs for rapid sorting and structural query correlation.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS approval_requests (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID representation
    correlation_id VARCHAR(64) NOT NULL, -- Cross-service trace string
    maker_id UUID NOT NULL, -- Admin ID who initiated the action
    action_type VARCHAR(50) NOT NULL
        CHECK (action_type IN ('LIMIT_OVERRIDE', 'KYC_CLEAR', 'ACCOUNT_UNFREEZE', 'MANUAL_CREDIT')),
    target_resource_id VARCHAR(64) NOT NULL, -- The specific resource ID being modified (e.g., account_id)
    payload JSONB NOT NULL, -- The execution arguments needed to perform the final mutation
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_reviews (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    request_id VARCHAR(26) NOT NULL REFERENCES approval_requests(id) ON DELETE RESTRICT,
    checker_id UUID NOT NULL, -- Independent Admin ID who evaluates the action
    decision VARCHAR(20) NOT NULL
        CHECK (decision IN ('APPROVE', 'REJECT')),
    justification_reason TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_checker_per_request UNIQUE (request_id, checker_id)
);

```

### Governance Indexing Strategy

- `CREATE INDEX idx_approvals_pending ON approval_requests(status, expires_at DESC) WHERE status = 'PENDING';` — Powers real-time operational dashboard queues for administrators.
- `CREATE UNIQUE INDEX idx_maker_checker_segregation ON approval_requests(id) INCLUDE (maker_id);` — Invariant enforcement target used by the application layer to block dual-role execution.

---

## 2. API Path Matrix & Payload Contracts

### Segregation of Duties Invariant (Maker-Checker Rule)

The system strictly enforces that `checker_id` **cannot** equal `maker_id`. If an administrator attempts to approve a request they originally initiated, the route interceptor drops the transaction immediately with an explicit authorization breach error.

### Endpoint Definitions

#### `POST /v1/approvals/request`

- **Security Interceptors:** Cluster Private / Internal Proxy Only. Requires a valid `X-Internal-API-Key`. When an admin service receives an instruction for a restricted mutation, it pauses execution and drops the state here instead.
- **Request Body (`CreateApprovalRequestDto`):**

```json
{
  "correlationId": "corr_f8b2c4d6...",
  "makerId": "adm_8b3d9a12-09e4-41bf-b1a3-2bfb2649a212",
  "actionType": "LIMIT_OVERRIDE",
  "targetResourceId": "01H7X1N8X5R3P7Q8W9Z2K4V5A1",
  "payload": {
    "accountId": "01H7X1N8X5R3P7Q8W9Z2K4V5A1",
    "newDailyLimitPaise": 500000000
  },
  "ttlMinutes": 120
}
```

- **Response Payload (`201 Created`):** Returns the generated request `id` and status mapping details.

#### `POST /v1/approvals/review/:requestId`

- **Security Interceptors:** Restricted Back-Office Access. Requires active admin token validation extracted via `X-User-ID` and `X-User-Role` from the Edge Proxy.
- **Request Body (`ReviewRequestDto`):**

```json
{
  "decision": "APPROVE",
  "justificationReason": "Verified commercial documentation matches merchant expansion parameters."
}
```

- **Response Payload (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "requestId": "01H7X9N4A3B2C1D0E9F8G7H6K2",
    "status": "APPROVED"
  },
  "meta": null,
  "error": null
}
```

---

## 3. Event-Driven Contract Topology

The Approval Service acts reactively to initiate compliance verification workflows and outputs the final outcomes asynchronously back into the system core mesh.

```text
                  ┌────────────────────────┐
                  │ Operations Dashboard   │
                  └───────────┬────────────┘
                              │
                              │ Admin executes review pass: POST /v1/approvals/review/:id
                              ▼
                  ┌────────────────────────┐
                  │    Approval Service    │
                  └───────────┬────────────┘
                              │
             Publishes Event: │
             (Topic Exchange) ▼
            ┌──────────────────────────────────────┐
            │ exchange: fintech.approvals          │
            └─────────────────┬────────────────────┘
                              │
            ┌─────────────────┴──────────────────┐
            │ routingKey:                        │ routingKey:
            │ approval.granted                   │ approval.rejected
            ▼                                    ▼
 ┌──────────────────────┐             ┌──────────────────────┐
 │ Queue:               │             │ Queue:               │
 │ account-service.apply│             │ audit-service.alert  │
 └──────────────────────┘             └──────────────────────┘

```

### Events Published

- **`approval.granted`**
- _Routing Key:_ `approval.granted`
- _Payload:_ Includes the final verified data packet parameters along with `makerId` and `checker_id` hashes to allow downstream systems to execute mutations safely.

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Segregation Failure Prevention:** Mock an administrative execution state where a worker tries to invoke the inner review function passing matching UUID values for both the `makerId` and `checker_id` fields. Assert that the validation rule prevents execution and throws a `SegregationOfDutiesViolationError`.

### Integration Testing Targets (Docker-Isolated Environment)

- **Concurrence Resolution Multi-Review Guard:** Create a single approval token entry with status `PENDING`. Fire two distinct concurrent administrator requests trying to commit conflicting `APPROVE` and `REJECT` choices within a single millisecond block. Assert that the database transaction isolation levels permit only one block change execution, throwing clean error responses to the second thread.
- **TTL Expiration Evaluation Loop:** Seed an approval task containing an expired `expires_at` timestamp parameter value. Invoke the review route using a valid administrator signature context. Assert that the service catches the timeout threshold, alters the database state column to `EXPIRED`, and explicitly returns a `400 Bad Request` execution rejection.

### Chaos Testing Matrix

- **Downstream Broker Disconnect During Clearance:** Execute a valid checker sign-off script while the primary network connection to RabbitMQ is fully cut off. Assert that the Approval Service **fails secure**: it rolls back its local database clearance update and maintains the internal tracking state as `PENDING`, ensuring no administrative updates take effect without confirmation of out-of-band message propagation.
