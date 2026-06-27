# 📊 Production Architectural Manual: Reporting Service (`services/reporting-service/`)

The Reporting Service is the platform's **Analytical and Business Intelligence Layer**. Its core function is to generate periodic end-of-day (EOD) financial reconciliations, tax statements, and compliance summaries for regulatory bodies.

To maintain strict service boundary isolation, **this service operates on an entirely read-heavy database engine**. It consumes asynchronous data streams via RabbitMQ to maintain a denormalized query lake, ensuring that heavy, complex analytical queries never compete for resources with the transaction engines handling active user transfers.

---

## 1. Database Domain Schema (`reporting_db`)

The Reporting Service utilizes an optimized relational schema or time-series tracking layout in PostgreSQL. It caches transactional entities denormalized for rapid sorting, analytical transformations, and high-volume date-range slicing.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS transaction_analytics_cube (
    id VARCHAR(26) PRIMARY KEY, -- Coordinated transaction ULID matching core ledger exactly
    sender_user_id UUID NOT NULL,
    receiver_user_id UUID NOT NULL,
    amount_paise BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    settlement_status VARCHAR(20) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_timestamp TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS reconciliation_reports (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    reporting_date DATE NOT NULL UNIQUE,
    total_volume_paise BIGINT NOT NULL,
    total_transaction_count INT NOT NULL,
    system_imbalance_detected BOOLEAN NOT NULL DEFAULT false,
    generated_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (generated_status IN ('PENDING', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Indexing Strategy

- `CREATE INDEX idx_analytics_cube_date_volume ON transaction_analytics_cube(transaction_date, amount_paise DESC);` — Core index maximizing speed on localized financial interval computations.
- `CREATE INDEX idx_analytics_user_history ON transaction_analytics_cube(sender_user_id, transaction_date DESC);` — Accelerates complex multi-month customer export requests.

---

## 2. API Path Matrix & Payload Contracts

The Reporting Service handles asynchronous data compilation pipelines. When an administrator triggers a report extraction pass, the API responds with a trackable background job signature immediately rather than blocking HTTP connection windows.

### Endpoint Definitions

#### `POST /v1/reports/reconciliation/trigger`

- **Security Interceptors:** Highly Restricted. Requires active administrative access credentials matching roles bounded exclusively to `auditor` or `admin`.
- **Request Body (`TriggerReportDto`):**

```json
{
  "targetDate": "2026-06-27"
}
```

- **Response Payload (`202 Accepted`):**

```json
{
  "success": true,
  "data": {
    "jobId": "01H7XCM4A3B2C1D0E9F8G7H6L9",
    "status": "PROCESSING"
  },
  "meta": null,
  "error": null
}
```

---

## 3. Event-Driven Contract Topology

The Reporting Service strictly observes domain events across the platform mesh, updating its localized database replica tables out-of-band.

```text
                      ┌─────────────────────────┐
                      │    Transfer Service     │
                      └────────────┬────────────┘
                                   │
                                   │ Publishes event: transfer.completed
                                   ▼
                     ┌───────────────────────────┐
                     │ exchange: fintech.transfers│
                     └─────────────┬─────────────┘
                                   │
                                   │ routingKey: transfer.completed
                                   ▼
                     ┌───────────────────────────┐
                     │ Queue:                    │
                     │ reporting.transfer_sync   │
                     └─────────────┬─────────────┘
                                   │
                                   │ Parses payload parameters into analytics cube
                                   ▼
                      ┌─────────────────────────┐
                      │    Reporting Service    │
                      └─────────────────────────┘

```

### Events Consumed

- **`transfer.completed` (From `transfer-service`)**: Updates the transaction analytics cube data rows instantly, maintaining up-to-date information for administrative dashboards.

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Reconciliation Imbalance Checker Test:** Feed the calculation engine a simulated report array containing a deliberate arithmetic mismatch between internal aggregated debits and credits. Assert that the verification module accurately sets `system_imbalance_detected = true` and fires critical warnings to the system logs.

### Integration Testing Targets (Docker-Isolated Environment)

- **High-Volume Analytics Ingestion Test:** Broadcast 1,000 asynchronous payment completion notifications into the test queue. Run the integration consumer suite. Assert that the analytics cube cleanly aggregates all rows without locking the table or experiencing structural drift.

### Chaos Testing Matrix

- **Out-of-Order Message Processing Test:** Publish a payment confirmation update followed by a delayed profile metadata creation script framework block out of structural sequence. Assert that the service handles mismatched entity updates gracefully by executing conditional database upserts without throwing integrity constraint errors.
