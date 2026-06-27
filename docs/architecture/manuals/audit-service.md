# 📜 Production Architectural Manual: Audit Service (`services/audit-service/`)

The Audit Service is the platform's central, immutable **Compliance & Forensic Logger**. It acts as a passive, non-blocking surveillance ledger that aggregates security incidents, configuration mutations, administrative interventions, and system access anomalies.

To maintain strict compliance and legal non-repudiation, **this service is strictly write-only** for normal operations and isolates its records from the transaction lifecycles of individual application databases.

---

## 1. Database Domain Schema (`audit_db`)

The Audit Service utilizes an isolated PostgreSQL instance. It stores entries using time-sortable alphanumeric ULIDs to allow fast time-range querying and deterministic chronological processing. All textual payload fields use binary JSON formatting (`JSONB`) to support dynamic tracking without structural migrations.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID representation
    correlation_id VARCHAR(64) NOT NULL, -- Global trace string passed across microservices
    actor_id VARCHAR(50) NOT NULL, -- Can map to user UUID, admin ID, or 'SYSTEM'
    actor_type VARCHAR(20) NOT NULL
        CHECK (actor_type IN ('CUSTOMER', 'ADMIN', 'SYSTEM_SERVICE', 'API_GATEWAY')),
    action_name VARCHAR(100) NOT NULL, -- e.g., 'auth.login_failed', 'kyc.override', 'limit.elevated'
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('SUCCESS', 'FAILURE', 'SUSPICIOUS')),
    ip_address INET DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    old_state JSONB DEFAULT NULL, -- Captured snapshot before mutation
    new_state JSONB DEFAULT NULL, -- Captured snapshot after mutation
    metadata JSONB DEFAULT NULL, -- Additional structural context logs
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Database Immutability & Security Configuration

To protect against tampering by inside actors or compromised application layer threads, the database role assigned to the Audit Service runtime container is stripped of update, modification, and truncation capabilities:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE platform_audit_logs FROM application_runtime_user;

```

### Indexing Strategy

- `CREATE INDEX idx_audit_chronological ON platform_audit_logs(created_at DESC, action_name);` — Key optimization vector used for generating compliance event pipelines and compliance reporting streams.
- `CREATE INDEX idx_audit_actor_lookup ON platform_audit_logs(actor_id, actor_type);` — Accelerates forensic tracking queries on specific high-risk identities.
- `CREATE INDEX idx_audit_correlation ON platform_audit_logs(correlation_id);` — Groups distributed cross-service events together under a single correlation tracking identifier.

---

## 2. API Path Matrix & Payload Contracts

The Audit Service exposes a highly restricted internal API layer. It does not accept any public connections from the internet edge proxy.

### Endpoint Definitions

#### `POST /v1/internal/audit/log`

- **Security Interceptors:** Cluster Private. Blocks external public hits via API Gateway policies. Mandates strict internal network token verification matching (`X-Internal-API-Key`).
- **Request Body (`CreateAuditLogDto`):**

```json
{
  "correlationId": "corr_f8b2c4d6...",
  "actorId": "adm_8b3d9a12-09e4-41bf-b1a3-2bfb2649a212",
  "actorType": "ADMIN",
  "actionName": "limit.elevated",
  "status": "SUCCESS",
  "ipAddress": "192.168.1.50",
  "userAgent": "Mozilla/5.0...",
  "oldState": { "daily_limit": 50000000 },
  "newState": { "daily_limit": 100000000 },
  "metadata": { "reason": "High-volume merchant onboarding override" }
}
```

- **Response Payload (`201 Created`):**

```json
{
  "success": true,
  "data": {
    "auditLogId": "01H7X8N4A3B2C1D0E9F8G7H6J1"
  },
  "meta": null,
  "error": null
}
```

---

## 3. Event-Driven Contract Topology

While explicit security overrides use synchronous paths to guarantee logging before action execution, everyday actions use asynchronous AMQP topic consumer loops to completely isolate the service from processing pipelines.

```text
                  ┌──────────────────────────────────────────────┐
                  │          RabbitMQ Message Exchanges          │
                  └──────┬──────────────────┬─────────────────┬──┘
                         │                  │                 │
     fintech.users       │   fintech.ledger │                 │ fintech.transfers
     (user.logged_in)    ▼  (balance.drop)  ▼                 ▼ (transfer.completed)
    ┌──────────────────────┐┌────────────────┐┌─────────────────────────┐
    │     Queue Name:      ││  Queue Name:   ││       Queue Name:       │
    │ audit.user_access    ││ audit.ledger   ││ audit.transfer_stream  │
    └──────────┬───────────┘└───────┬────────┘└────────────┬────────────┘
               │                    │                      │
               └──────────┐         │         ┌────────────┘
                          ▼         ▼         ▼
                     ┌─────────────────────────┐
                     │      Audit Service      │
                     └────────────┬────────────┘
                                  │
                  Appends Immutable Audit Entry Row
                                  ▼
                     ┌─────────────────────────┐
                     │       audit_db          │
                     └─────────────────────────┘

```

### Events Consumed & Logging Targets

- **`user.logged_in` / `user.login_failed**`(From`auth-service`): Tracks access telemetry directly, cataloging failed attempts alongside IP signatures to facilitate real-time threat analysis loops.
- **`transfer.completed`** (From `transfer-service`): Records end-to-end movement history for compliance audit cross-referencing.

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Metadata Payload Sanitization:** Test the input processing logic. Assert that any metadata objects containing plaintext sensitive field keys (such as `password`, `cvv`, or `pin`) are automatically masked or stripped out by the service's serialization layer before reaching database engine operations.

### Integration Testing Targets (Docker-Isolated Environment)

- **Tamper-Proof Modification Prevention:** Design an integration pipeline that attempts to run a raw SQL `UPDATE` or `DELETE` string against an existing log ID row in the `platform_audit_logs` container table. Assert that the database engine rejects the command with a strict SQL execution permission exception.
- **Asynchronous High-Throughput Convergence:** Flood the AMQP test exchange with 500 interleaved concurrent audit events sharing various tracking keys. Query the isolated database container. Assert that all 500 items are logged sequentially with matching, accurate timestamps and uncorrupted tracking keys.

### Chaos Testing Matrix

- **Database Target Partition Failure:** Cut off the connectivity channel between the Audit Service container and its primary database engine while system access events are streaming. Assert that the service's internal buffers dump unrecorded event streams into an isolated local failover storage queue to prevent the loss of forensic compliance records under cluster degradation.
