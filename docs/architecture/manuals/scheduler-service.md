# ⏱️ Production Architectural Manual: Scheduler Service (`services/scheduler-service/`)

The Scheduler Service is the platform's distributed **Cron Engine and Time-Based Orchestrator**. In a production-grade microservices architecture, individual services must not manage their own internal timing intervals or background loops (e.g., using naive node-cron bindings inside API workers). Doing so results in duplicate task execution when services scale out to multiple container instances.

The Scheduler Service isolates all time-based triggers. It utilizes a highly persistent, centralized database backend to manage scheduled tasks, handle cluster leader election, and broadcast execution ticks exactly-once over RabbitMQ when chronological criteria are met.

---

## 1. Database Domain Schema (`scheduler_db`)

The Scheduler Service manages an isolated PostgreSQL instance designed to act as a highly accurate state machine for time-delayed infrastructure tasks.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID representation
    name VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'DAILY_EOD_RECONCILIATION', 'BALANCE_SNAPSHOT_SWEEP'
    target_exchange VARCHAR(100) NOT NULL, -- The RabbitMQ topic exchange to notify
    routing_key VARCHAR(100) NOT NULL, -- The specific routing key parameter
    cron_expression VARCHAR(50) NOT NULL, -- Standard crontab notation (e.g., '0 0 * * *')
    payload JSONB DEFAULT NULL, -- Static execution configuration parameters passed to consumer
    status VARCHAR(20) NOT NULL DEFAULT 'IDLE'
        CHECK (status IN ('IDLE', 'RUNNING', 'PAUSED')),
    last_run_at TIMESTAMPTZ DEFAULT NULL,
    next_run_at TIMESTAMPTZ NOT NULL,
    version INT NOT NULL DEFAULT 1, -- Optimistic locking counter for cluster concurrency
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_execution_history (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    job_id VARCHAR(26) NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ DEFAULT NULL,
    execution_status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
        CHECK (execution_status IN ('SUCCESS', 'FAILED')),
    error_log TEXT DEFAULT NULL
);

```

### Indexing & Concurrency Strategy

- `CREATE INDEX idx_jobs_next_trigger ON scheduled_jobs(next_run_at, status) WHERE status = 'IDLE';` — Primary polling optimization target for the cron runner loop.
- **Optimistic Locking Guard:** The `version` column guarantees that if multiple scheduler engine replicas attempt to fetch and lock a job concurrently, only the container that successfully updates the row matching the read version succeeds.

---

## 2. The Distributed Execution Loop (No Public APIs)

The Scheduler Service exposes zero public routes. It functions strictly as an autonomous cluster worker that tracks time and dispatches events.

```text
       [ Tick: Internal 1-Second Precision Polling Loop ]
                                │
                                ▼
         Query `scheduled_jobs` WHERE `next_run_at` <= NOW()
                                │
         ┌──────────────────────┴──────────────────────┐
    ( Job Found )                               ( None Found )
         ▼                                             ▼
  Attempt Optimistic Lock:                            Sleep
  SET status='RUNNING', version=version+1
  WHERE version=old_version
         │
    ┌────┴────────────────────────┐
( Lock Acquired )           ( Lock Failed ) ──► Silent Short-Circuit (Another instance won)
    ▼
1. Append row to `job_execution_history`
2. Publish payload out-of-band to target RabbitMQ Exchange
3. Compute next runtime via cron string parser
4. Reset state to 'IDLE', update `next_run_at`, set version=version+1

```

---

## 3. Event-Driven Contract Topology

The Scheduler Service does not know the business logic of what happens when a task fires. It simply acts as a generic "alarm clock" broadcasting events across the platform mesh.

```text
                     ┌─────────────────────────┐
                     │    Scheduler Service    │
                     └────────────┬────────────┘
                                  │
      Fires Asynchronous Ticks:   │ (Topic Exchange Routing)
                                  ▼
                  ┌──────────────────────────────────────┐
                  │ exchange: fintech.scheduler          │
                  └───────────────────┬──────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │ routingKey:                                       │ routingKey:
            │ scheduler.trigger.eod_reconciliation              │ scheduler.trigger.snapshot_sweep
            ▼                                                   ▼
┌──────────────────────┐                            ┌──────────────────────┐
│ Queue:               │                            │ Queue:               │
│ reporting-service.eod│                            │ ledger-service.snap  │
└──────────────────────┘                            └──────────────────────┘

```

### Primary Outbound Event Templates

- **`scheduler.trigger.eod_reconciliation`**
- _Routing Key:_ `scheduler.trigger.eod_reconciliation`
- _Payload:_

```json
{
  "eventId": "evt_01H7XDM4A3B2C1D0E9F8G7H6M0",
  "eventType": "scheduler.trigger.eod_reconciliation",
  "producerService": "scheduler-service",
  "correlationId": "corr_cron_eod_20260627...",
  "payload": {
    "jobName": "DAILY_EOD_RECONCILIATION",
    "executionTargetDate": "2026-06-27"
  },
  "occurredAt": "2026-06-27T00:00:00.000Z"
}
```

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Cron Expression Parser Invariant:** Feed the scheduler engine utility a complex crontab notation containing adjustments for leap years or specific monthly boundaries. Assert that the mathematical date engine correctly maps out the next subsequent three runtimes exactly matching standard scheduling criteria.

### Integration Testing Targets (Docker-Isolated Environment)

- **Optimistic Concurrency Lock Protection:** Spin up three separate worker threads simultaneously running the exact same polling script against a seeded single target job row whose `next_run_at` time field evaluates to the past. Assert that exactly one instance successfully updates the column status to `RUNNING` and issues a single AMQP payload event, while the remaining two instances abort execution cleanly with zero duplicate runs.

### Chaos Testing Matrix

- **Downstream Broker Disruption Mid-Tick:** Simulate an absolute connectivity drop to RabbitMQ exactly at the millisecond the scheduler attempts to execute a job tick. Assert that the local transaction block safely aborts, rolling the record status flags backward to `IDLE` to ensure the task remains queued for execution the moment the cluster regains communications stability.
